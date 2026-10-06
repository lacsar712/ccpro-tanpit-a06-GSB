from decimal import Decimal

from django.contrib.auth.hashers import check_password, make_password
from django.db import models


class User(models.Model):
    username = models.CharField(max_length=64, unique=True)
    password_hash = models.CharField(max_length=256)
    role = models.CharField(max_length=20, default="worker")

    def set_password(self, raw: str) -> None:
        self.password_hash = make_password(raw)

    def check_password(self, raw: str) -> bool:
        return check_password(raw, self.password_hash)


class Yard(models.Model):
    name = models.CharField(max_length=120)
    village = models.CharField(max_length=120, blank=True)


class Pit(models.Model):
    STATUS_FILL = "fill"
    STATUS_TANNING = "tanning"
    STATUS_DRAINED = "drained"

    yard = models.ForeignKey(Yard, on_delete=models.CASCADE, related_name="pits")
    code = models.CharField(max_length=40)
    status = models.CharField(max_length=20, default=STATUS_FILL)
    row = models.IntegerField(default=0)
    col = models.IntegerField(default=0)

    class Meta:
        unique_together = ("yard", "code")


class SampleBucket(models.Model):
    """取样桶：一场共用一只现行桶，水位单位升。"""

    yard = models.ForeignKey(Yard, on_delete=models.CASCADE, related_name="buckets")
    level = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0.2"))
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["yard"],
                condition=models.Q(is_active=True),
                name="uniq_active_bucket_per_yard",
            ),
            models.CheckConstraint(check=models.Q(level__gte=0), name="bucket_level_non_negative"),
        ]


class LiquorSample(models.Model):
    pit = models.ForeignKey(Pit, on_delete=models.CASCADE, related_name="samples")
    taken_at = models.DateTimeField(auto_now_add=True)
    ph = models.FloatField()
    operator = models.CharField(max_length=64, blank=True)
    bucket = models.ForeignKey(
        SampleBucket, on_delete=models.PROTECT, related_name="samples", null=True, blank=True
    )
