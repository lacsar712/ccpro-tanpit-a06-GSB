from decimal import Decimal

from pits.models import LiquorSample, Pit, SampleBucket, User, Yard


def seed_demo() -> None:
    admin, _ = User.objects.get_or_create(username="admin", defaults={"role": "admin"})
    admin.role = "admin"
    admin.set_password("123456")
    admin.save()
    worker, _ = User.objects.get_or_create(username="worker", defaults={"role": "worker"})
    worker.role = "worker"
    worker.set_password("123456")
    worker.save()
    if not Yard.objects.exists():
        yard = Yard.objects.create(name="南冈鞣场", village="青皮村")
        layout = [
            ("东-1", Pit.STATUS_TANNING, 0, 0, 4.2),
            ("东-2", Pit.STATUS_FILL, 0, 1, None),
            ("中-1", Pit.STATUS_DRAINED, 1, 0, 4.6),
            ("中-2", Pit.STATUS_TANNING, 1, 1, 6.1),
            ("西-1", Pit.STATUS_FILL, 2, 0, None),
            ("西-2", Pit.STATUS_DRAINED, 2, 1, 3.8),
        ]
        for code, status, row, col, ph in layout:
            pit = Pit.objects.create(yard=yard, code=code, status=status, row=row, col=col)
            if ph is not None:
                LiquorSample.objects.create(pit=pit, ph=ph, operator="worker")
    # 每场保证一只现行取样桶，种子水位 0.2 升
    for yard in Yard.objects.all():
        if not yard.buckets.filter(is_active=True).exists():
            SampleBucket.objects.create(yard=yard, level=Decimal("0.2"))
