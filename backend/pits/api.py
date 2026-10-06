from decimal import Decimal

from django.db import transaction
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import LiquorSample, Pit, SampleBucket, User, Yard
from pits.rules import RuleError, assert_can_set_status, latest_ph

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()

# 每成功登记一条酸碱度，从本场取样桶扣的水量（升）
SAMPLE_COST = Decimal("0.2")


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class RefillIn(Schema):
    amount: Decimal


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


def bucket_json(bucket: SampleBucket) -> dict:
    return {
        "id": bucket.id,
        "yardId": bucket.yard_id,
        "yardName": bucket.yard.name,
        "level": float(bucket.level),
        "isActive": bucket.is_active,
        "createdAt": bucket.created_at,
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
    return [{"id": y.id, "name": y.name, "village": y.village} for y in Yard.objects.order_by("id")]


@api.get("/buckets", auth=auth)
def list_buckets(request, yard_id: int | None = None):
    qs = SampleBucket.objects.select_related("yard").order_by("-is_active", "-created_at", "-id")
    if yard_id is not None:
        qs = qs.filter(yard_id=yard_id)
    return [bucket_json(b) for b in qs]


@api.post("/buckets/{bucket_id}/refill", auth=auth)
def refill_bucket(request, bucket_id: int, payload: RefillIn):
    require_admin(request.auth)
    amount = payload.amount
    if not amount.is_finite() or amount < 0:
        raise HttpError(400, "补水量必须是不小于 0 的数")
    with transaction.atomic():
        bucket = (
            SampleBucket.objects.select_for_update()
            .select_related("yard")
            .filter(id=bucket_id)
            .first()
        )
        if bucket is None:
            raise HttpError(404, "取样桶不存在")
        bucket.level = bucket.level + amount
        bucket.save(update_fields=["level"])
    return bucket_json(bucket)


@api.get("/board", auth=auth)
def board(request):
    yard = Yard.objects.prefetch_related("pits__samples").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {"yard": yard.name, "village": yard.village, "pits": [pit_json(p) for p in pits]}


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    with transaction.atomic():
        pit = Pit.objects.select_related("yard").filter(id=pit_id).first()
        if pit is None:
            raise HttpError(404, "坑不存在")
        # 锁本场现行桶：并发登记在此排队，保证扣水与入库同一事务、不超扣
        bucket = (
            SampleBucket.objects.select_for_update()
            .filter(yard=pit.yard, is_active=True)
            .first()
        )
        if bucket is None:
            raise HttpError(409, "本场尚无现行取样桶，无法登记酸碱度，请先补水")
        if bucket.level < SAMPLE_COST:
            raise HttpError(
                400,
                f"取样桶水位仅 {bucket.level:.1f} 升，不足 0.2 升，不能登记酸碱度，请通知管理员补水",
            )
        LiquorSample.objects.create(
            pit=pit, ph=payload.ph, operator=request.auth.username, bucket=bucket
        )
        bucket.level = bucket.level - SAMPLE_COST
        bucket.save(update_fields=["level"])
        pit = Pit.objects.prefetch_related("samples").get(id=pit.id)
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
    pit.status = payload.status
    pit.save(update_fields=["status"])
    return pit_json(pit)
