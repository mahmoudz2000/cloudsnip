"""
analytics/handler.py

Handles GET /analytics/{shortCode}

Returns stats for a given short link - click count, when it was created, etc.
Used by the frontend dashboard when you click "Analytics" on a link.
"""

import logging
import os
import sys

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, "/opt/python")

from utils import build_response

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

TABLE_NAME = os.environ["TABLE_NAME"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """Fetch and return analytics for a short code"""

    path_params = event.get("pathParameters") or {}
    short_code = (path_params.get("shortCode") or "").strip()

    if not short_code:
        return build_response(400, {"error": "No short code provided"})

    logger.info("Analytics request for: %s", short_code)

    try:
        resp = table.get_item(Key={"shortCode": short_code})
    except ClientError:
        logger.exception("DynamoDB error")
        return build_response(500, {"error": "Something went wrong"})

    item = resp.get("Item")

    if not item:
        return build_response(404, {"error": f"Short code '{short_code}' not found"})

    # build the response - only expose the fields the frontend needs
    # (don't expose internal stuff like the GSI partition key)
    data = {
        "shortCode": item["shortCode"],
        "originalUrl": item["originalUrl"],
        "clickCount": int(item.get("clickCount", 0)),
        "createdAt": item.get("createdAt"),
        "lastClickedAt": item.get("lastClickedAt"),  # None if never clicked
        "isCustomAlias": item.get("isCustomAlias", False),
        "expiresAt": int(item.get("expiresAt", 0)),
    }

    return build_response(200, data)
