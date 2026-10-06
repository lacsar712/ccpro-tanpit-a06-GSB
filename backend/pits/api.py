from ninja import NinjaAPI, Query, Schema
from ninja.errors import HttpError
from django.db import transaction

from pits.auth import BearerAuth, make_token
from pits.models import Pit, SamplingBucket, User, Yard
from pits.rules import RuleError, assert_can_set_status, consume_bucket_for_sample, latest_ph

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class RefillIn(Schema):
    amount: float


class BucketFilter(Schema):
    yard_id: int | None = None


def yard_json(yard: Yard) -> dict:
    return {"id": yard.id, "name": yard.name, "village": yard.village}


def bucket_json(bucket: SamplingBucket) -> dict:
    return {
        "id": bucket.id,
        "level": round(bucket.level, 1),
        "yard": yard_json(bucket.yard),
    }


def pit_json(pit: Pit) -> dict:
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
    }


def require_admin(user: User) -> None:
    if user.role != "admin":
        raise HttpError(403, "仅管理员可补水")


@api.post("/auth/login")
def login(request, payload: LoginIn):
    user = User.objects.filter(username=payload.username).first()
    if user is None or not user.check_password(payload.password):
        raise HttpError(401, "用户名或密码错误")
    return {"access_token": make_token(user.username), "user": {"username": user.username, "role": user.role}}


@api.get("/auth/me", auth=auth)
def me(request):
    user = request.auth
    return {"username": user.username, "role": user.role}


@api.get("/health")
def health(request):
    return {"status": "ok", "service": "TanPit"}


@api.get("/yards", auth=auth)
def yards(request):
    return [yard_json(y) for y in Yard.objects.order_by("id")]


@api.get("/buckets", auth=auth)
def buckets(request, filters: BucketFilter = Query(...)):
    """现行取样桶列表：同一场最多一只；操作工可看，可按场筛选。"""
    qs = SamplingBucket.objects.select_related("yard").order_by("yard__id")
    if filters.yard_id is not None:
        qs = qs.filter(yard_id=filters.yard_id)
    return [bucket_json(b) for b in qs]


@api.post("/buckets/{bucket_id}/refill", auth=auth)
def refill_bucket(request, bucket_id: int, payload: RefillIn):
    """管理员补水。水位只能是不小于 0 的数。"""
    require_admin(request.auth)
    bucket = SamplingBucket.objects.filter(id=bucket_id).first()
    if bucket is None:
        raise HttpError(404, "取样桶不存在")
    amount = payload.amount
    if amount != amount or amount in (float("inf"), float("-inf")):
        raise HttpError(400, "补水量须为数字")
    if amount < 0:
        raise HttpError(400, "补水量不得为负数")
    with transaction.atomic():
        bucket = SamplingBucket.objects.select_for_update().get(id=bucket_id)
        bucket.level = round(bucket.level + amount, 6)
        bucket.save(update_fields=["level", "updated_at"])
    return bucket_json(bucket)


@api.get("/board", auth=auth)
def board(request):
    yard = Yard.objects.prefetch_related("pits__samples").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    bucket = SamplingBucket.objects.filter(yard=yard).first()
    return {
        "yard": yard.name,
        "yardId": yard.id,
        "village": yard.village,
        "bucketLevel": round(bucket.level, 1) if bucket else None,
        "pits": [pit_json(p) for p in pits],
    }


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    pit = Pit.objects.filter(id=pit_id).select_related("yard").first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    # 扣水与酸碱入库必须同一事务：桶行被锁住，后到的并发一笔看到 0 水位即被挡住。
    try:
        with transaction.atomic():
            consume_bucket_for_sample(pit)
            pit.samples.create(ph=payload.ph, operator=request.auth.username)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    pit.refresh_from_db()
    return pit_json(pit)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    try:
        assert_can_set_status(pit, payload.status)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    # 改坑态不扣水位。
    pit.status = payload.status
    pit.save(update_fields=["status"])
    return pit_json(pit)
