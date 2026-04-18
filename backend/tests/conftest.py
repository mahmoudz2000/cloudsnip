"""Pytest fixtures shared across all backend tests."""

from __future__ import annotations

import os
import sys

import boto3
import pytest
from moto import mock_aws

# Make the shared utilities importable without the Lambda Layer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

TABLE_NAME = "cloudsnip-urls-test"


@pytest.fixture(autouse=True)
def aws_credentials(monkeypatch):
    """Ensure boto3 never hits real AWS during tests."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SECURITY_TOKEN", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")


@pytest.fixture()
def dynamodb_table(aws_credentials):
    """Create a fresh moto DynamoDB table and return its resource handle."""
    with mock_aws():
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
        resource = boto3.resource("dynamodb", region_name="us-east-1")
        yield resource.Table(TABLE_NAME)
