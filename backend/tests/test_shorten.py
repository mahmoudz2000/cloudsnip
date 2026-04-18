"""Tests for the shorten Lambda handler."""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import patch

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "functions", "shorten")
)

TABLE_NAME = "cloudsnip-urls-test"


def _make_event(body: dict) -> dict:
    return {"body": json.dumps(body)}


@pytest.fixture(autouse=True)
def patch_env(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", TABLE_NAME)
    monkeypatch.setenv("LOG_LEVEL", "WARNING")


@mock_aws
class TestShortenHandler:
    """Test suite for handler.lambda_handler."""

    def _setup_table(self):
        client = boto3.client("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[{"AttributeName": "shortCode", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "shortCode", "AttributeType": "S"},
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "createdAt", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "createdAt-index",
                    "KeySchema": [
                        {"AttributeName": "pk", "KeyType": "HASH"},
                        {"AttributeName": "createdAt", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
        )

    def test_shorten_valid_url_returns_201(self):
        self._setup_table()
        from handler import lambda_handler  # noqa: PLC0415

        event = _make_event({"url": "https://example.com/long/path"})
        resp = lambda_handler(event, {})

        assert resp["statusCode"] == 201
        body = json.loads(resp["body"])
        assert "shortCode" in body
        assert body["originalUrl"] == "https://example.com/long/path"
        assert len(body["shortCode"]) == 7

    def test_shorten_with_custom_alias(self):
        self._setup_table()
        from handler import lambda_handler  # noqa: PLC0415

        event = _make_event(
            {"url": "https://example.com", "customAlias": "my-test"}
        )
        resp = lambda_handler(event, {})

        assert resp["statusCode"] == 201
        body = json.loads(resp["body"])
        assert body["shortCode"] == "my-test"

    def test_shorten_duplicate_alias_returns_409(self):
        self._setup_table()
        from handler import lambda_handler  # noqa: PLC0415

        event = _make_event(
            {"url": "https://example.com", "customAlias": "dupe"}
        )
        lambda_handler(event, {})  # first call
        resp = lambda_handler(event, {})  # second call — conflict

        assert resp["statusCode"] == 409
        body = json.loads(resp["body"])
        assert "taken" in body["error"]

    def test_shorten_missing_url_returns_400(self):
        self._setup_table()
        from handler import lambda_handler  # noqa: PLC0415

        resp = lambda_handler(_make_event({}), {})

        assert resp["statusCode"] == 400
        body = json.loads(resp["body"])
        assert "url" in body["error"]

    def test_shorten_invalid_url_returns_400(self):
        self._setup_table()
        from handler import lambda_handler  # noqa: PLC0415

        resp = lambda_handler(_make_event({"url": "not-a-url"}), {})

        assert resp["statusCode"] == 400
        assert "Invalid URL" in json.loads(resp["body"])["error"]

    def test_shorten_invalid_alias_returns_400(self):
        self._setup_table()
        from handler import lambda_handler  # noqa: PLC0415

        resp = lambda_handler(
            _make_event({"url": "https://example.com", "customAlias": "x"}),
            {},
        )

        assert resp["statusCode"] == 400

    def test_shorten_invalid_ttl_returns_400(self):
        self._setup_table()
        from handler import lambda_handler  # noqa: PLC0415

        resp = lambda_handler(
            _make_event({"url": "https://example.com", "ttlDays": 0}), {}
        )

        assert resp["statusCode"] == 400

    def test_response_has_cors_headers(self):
        self._setup_table()
        from handler import lambda_handler  # noqa: PLC0415

        resp = lambda_handler(
            _make_event({"url": "https://example.com"}), {}
        )

        assert "Access-Control-Allow-Origin" in resp["headers"]
        assert resp["headers"]["Access-Control-Allow-Origin"] == "*"
