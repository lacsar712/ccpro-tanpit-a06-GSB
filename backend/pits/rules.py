"""鞣坑作业门槛。

- 放液：最近一次浸液酸碱度须在 3.5～5.0（只认酸碱带，与取样桶水位无关）。
- 登记酸碱度：每登记一条须在同一事务内从本场取样桶扣 0.2 升，水位不足则挡住。
"""

from django.db import transaction

from pits.models import Pit, SamplingBucket

MIN_PH = 3.5
MAX_PH = 5.0

# 每登记一条酸碱度扣除的水位（升）
SAMPLE_WATER_COST = 0.2


class RuleError(ValueError):
    pass


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def assert_can_set_status(pit: Pit, new_status: str) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status != Pit.STATUS_DRAINED:
        return
    ph = latest_ph(pit)
    if ph is None:
        raise RuleError("该坑尚无浸液酸碱记录，不能放液")
    if ph < MIN_PH or ph > MAX_PH:
        raise RuleError(f"最近酸碱度 {ph} 不在 {MIN_PH}～{MAX_PH}，不能放液")


@transaction.atomic
def consume_bucket_for_sample(pit: Pit) -> SamplingBucket:
    """登记酸碱度前扣水。

    行锁锁住本场现行桶，水位不足直接抛 RuleError（事务回滚，酸碱不入库）。
    并发两笔各扣 0.2 时，后到的一笔会看到被扣后的水位而被挡住。
    """
    bucket = (
        SamplingBucket.objects.select_for_update().filter(yard_id=pit.yard_id).first()
    )
    if bucket is None:
        raise RuleError("本场取样桶不存在，请联系管理员补水")
    if bucket.level < SAMPLE_WATER_COST:
        raise RuleError(f"取样桶水位 {bucket.level:.1f} 升不足 {SAMPLE_WATER_COST:.1f} 升，不能登记酸碱度")
    bucket.level = max(0.0, round(bucket.level - SAMPLE_WATER_COST, 6))
    bucket.save(update_fields=["level", "updated_at"])
    return bucket
