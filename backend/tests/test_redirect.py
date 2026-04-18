"""Tests for the redirect Lambda handler."""

from __future__ import annotations

import json
import os
import sys

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "functions", "redirect")
)

TABLE_NAME = "cloudsnip-urls-test"
ORIGINAL_URL = "https://example.com/original/page"
SHORT_CODE = "abc1234"


@pytest.fixture(autouse=True)
def patch_env(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", TABLE_NAME)
    monkeypatch.setenv("LOG_LEVEL", "WARNING")


def _make_event(short_code: str) -> dict:
    return {"pathParameters": {"shortCode": short_code}}


@mock_aws
class TestRedirectHandler:
    """Test suite for handler.lambda_handler (redirect)."""

    def _setup_table_with_item(self):
        client = boto3.client("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[{"AttributeName": "shortCode", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "shortCode", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        resource = boto3.resource("dynamodb", region_name="us-east-1")
        table = resource.Table(TABLE_NAME)
        table.put_item(
            Item={
                "shortCode": SHORT_CODE,
                "originalUrl": ORIGINAL_URL,
                "clickCount": 0,
                "pk": "URL",
                "createdAt": "2024-01-01T00:00:00Z",
            }
        )
        return table

    def test_redirect_returns_301(self):
        table = self._setup_table_with_item()
        from handler import lambda_handler  # noqa: PLC0415

        resp = lambda_handler(_make_event(SHORT_CODE), {})

        assert resp["statusCode"] == 301
        assert resp["headers"]["Location"] == ORIGINAL_URL

    def test_redirect_increments_click_count(self):
        table = self._setup_table_with_item()
        from handler import lambda_handler  # noqa: PLC0415

        lambda_handler(_make_event(SHORT_CODE), {})
        lambda_handler(_make_event(SHORT_CODE), {})

        item = table.get_item(Key={"shortCode": SHORT_CODE})["Item"]
        assert int(item["clickCount"]) == 2

    def test_redirect_unknown_code_returns_404(self):
        self._setup_table_with_item()
        from handler import lambda_handler  # noqa: PLC0415

        resp = lambda_handler(_make_event("unknown"), {})

        assert resp["statusCode"] == 404

    def test_redirect_missing_short_code_returns_400(self):
        self._setup_table_with_item()
        from handler import lambda_handler  # noqa: PLC0415

        resp = lambda_handler({"pathParameters": {}}, {})

        assert resp["statusCode"] == 400


@mock_aws
class TestAnalyticsHandler:
    """Test suite for the analytics handler."""

    def _setup_table(self):
        client = boto3.client("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[{"AttributeName": "shortCode", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "shortCode", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        resource = boto3.resource("dynamodb", region_name="us-east-1")
        table = resource.Table(TABLE_NAME)
        table.put_item(
            Item={
                "shortCode": SHORT_CODE,
                "originalUrl": ORIGINAL_URL,
                "clickCount": 7,
                "pk": "URL",
                "createdAt": "2024-01-01T00:00:00Z",
                "isCustomAlias": False,
                "expiresAt": 9999999999,
            }
        )
        return table

    def test_analytics_returns_correct_data(self, monkeypatch):
        monkeypatch.setenv("TABLE_NAME", TABLE_NAME)
        self._setup_table()

        # Import analytics handler directly
        analytics_path = os.path.join(
            os.path.dirname(__file__), "..", "functions", "analytics"
        )
        sys.path.insert(0, analytics_path)
        from handler import lambda_handler as analytics_handler  # noqa: PLC0415

        resp = analytics_handler(
            {"pathParameters": {"shortCode": SHORT_CODE}}, {}
        )

        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["shortCode"] == SHORT_CODE
        assert body["clickCount"] == 7
        assert body["originalUrl"] == ORIGINAL_URL

    def test_analytics_unknown_code_returns_404(self, monkeypatch):
        monkeypatch.setenv("TABLE_NAME", TABLE_NAME)
        self._setup_table()

        analytics_path = os.path.join(
            os.path.dirname(__file__), "..", "functions", "analytics"
        )
        sys.path.insert(0, analytics_path)
        from handler import lambda_handler as analytics_handler  # noqa: PLC0415

        resp = analytics_handler(
            {"pathParameters": {"shortCode": "nope"}}, {}
        )
        assert resp["statusCode"] == 404
