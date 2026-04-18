"""
redirect/handler.py

This Lambda handles GET /{shortCode}

It looks up the short code in DynamoDB and redirects to the original URL.
Also records the click by incrementing clickCount.

I'm using a 301 (permanent) redirect here. Some people use 302 (temporary)
but 301 is more accurate for a URL shortener since the mapping doesn't change.

NOTE: the click count update is non-fatal - if it fails, we still redirect.
I decided the redirect should always work even if analytics breaks.
"""

import logging
import os
import sys
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, "/opt/python")

from utils import build_redirect, build_response

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

TABLE_NAME = os.environ["TABLE_NAME"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """Look up a short code and redirect to the original URL"""

    # get the short code from the URL path (e.g. GET /abc123 -> "abc123")
    path_params = event.get("pathParameters") or {}
    short_code = (path_params.get("shortCode") or "").strip()

    if not short_code:
        return build_response(400, {"error": "No short code provided"})

    logger.info("Redirect request for: %s", short_code)

    # look up the item in DynamoDB
    try:
        resp = table.get_item(Key={"shortCode": short_code})
    except ClientError:
        logger.exception("DynamoDB error when looking up %s", short_code)
        return build_response(500, {"error": "Something went wrong"})

    item = resp.get("Item")

    if not item:
        # short code doesn't exist (or has expired - DynamoDB TTL auto-deleted it)
        return build_response(404, {"error": f"Short link '/{short_code}' not found"})

    original_url = item["originalUrl"]

    # --- record the click ---
    # using ADD for clickCount instead of SET so it's atomic
    # (if two people click at the same time, both clicks get counted correctly)
    # this is called an "atomic counter" in DynamoDB - pretty cool feature
    now = datetime.now(timezone.utc).isoformat()
    try:
        table.update_item(
            Key={"shortCode": short_code},
            UpdateExpression="SET clickCount = if_not_exists(clickCount, :zero) + :one, lastClickedAt = :now",
            ExpressionAttributeValues={
                ":one": 1,
                ":zero": 0,
                ":now": now,
            },
        )
    except ClientError:
        # if analytics update fails, still redirect - don't break the user experience
        logger.exception("Failed to record click for %s (non-fatal)", short_code)

    logger.info("Redirecting %s -> %s", short_code, original_url)
    return build_redirect(original_url)
