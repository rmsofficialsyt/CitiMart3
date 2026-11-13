"""Two-tier dashboard cache: L1 per process + L2 Redis, version-invalidated.

"Replica B" is simulated by wiping this process's L1 state, which is
exactly what a different process would start with."""
from __future__ import annotations

from datetime import date, time

import pytest
import redis

from src import daily_dashboard_store as store


def _as_other_replica():
    with store._CACHE_LOCK:
        store._CACHE.clear()
        store._L1_VERSION = None


@pytest.fixture()
def redis_cache(fake_redis):
    _as_other_replica()
    yield fake_redis
    _as_other_replica()


def test_l2_serves_a_replica_with_a_cold_l1(redis_cache):
    assert store._get_from_cache("k") is None
    store._set_in_cache("k", {"net_sales": 10.0})
    _as_other_replica()
    assert store._get_from_cache("k") == {"net_sales": 10.0}
    assert redis_cache.ttl("cache:daily:v0:k") > 0


def test_write_on_another_replica_evicts_this_replicas_l1(redis_cache):
    store._get_from_cache("k")
    store._set_in_cache("k", {"v": 1})
    assert store._get_from_cache("k") == {"v": 1}  # L1 hit
    redis_cache.incr("cache:daily:ver")  # what invalidate_dashboard_cache does on replica A
    assert store._get_from_cache("k") is None


def test_value_computed_across_a_concurrent_write_is_never_served(redis_cache):
    assert store._get_from_cache("k") is None  # read starts under v0
    store.invalidate_dashboard_cache()  # a write lands mid-computation -> v1
    store._set_in_cache("k", {"stale": True})  # filed under v0, already dead
    assert store._get_from_cache("k") is None
    _as_other_replica()
    assert store._get_from_cache("k") is None


def test_non_json_round_trippable_values_stay_out_of_l2(redis_cache):
    store._get_from_cache("t")
    store._set_in_cache("t", {"pair": (1, 2)})
    assert not redis_cache.exists("cache:daily:v0:t")
    assert store._get_from_cache("t") == {"pair": (1, 2)}  # still L1-cached


class _FlakyRedis:
    def __getattr__(self, _name):
        def fail(*_a, **_k):
            raise redis.ConnectionError("down")

        return fail


def test_redis_outage_reads_through_instead_of_serving_stale():
    from db.redis_client import set_redis_for_tests

    store._set_in_cache("k", {"v": 1})  # no Redis: plain L1
    set_redis_for_tests(_FlakyRedis())  # type: ignore[arg-type]
    assert store._get_from_cache("k") is None
    store._set_in_cache("k", {"v": 2})  # no-op: freshness unprovable
    store.invalidate_dashboard_cache()  # must not raise


def test_live_kpis_reflect_a_write_from_another_replica_immediately(db_session, redis_cache):
    day = date(2026, 11, 13)
    store.add_bill_entry(db_session, "NM", day, time(11, 0), 1000.0, 2)
    assert store.compute_live_kpis(db_session, "NM", day)["net_sales"] == 1000.0
    _as_other_replica()
    assert store.compute_live_kpis(db_session, "NM", day)["net_sales"] == 1000.0  # replica B, warm from L2
    store.add_bill_entry(db_session, "NM", day, time(12, 0), 500.0, 1)  # write via "replica A"
    assert store.compute_live_kpis(db_session, "NM", day)["net_sales"] == 1500.0
