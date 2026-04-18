"""
shorten/handler.py

This Lambda handles POST /shorten - takes a long URL and creates a short one.

How it works:
1. Parse the request body (JSON)
2. Validate the URL and any optional params
3. Generate a short code (or use the custom alias they provided)
4. Save it to DynamoDB
5. Return the short URL

Request body:
    {
        "url": "https://example.com/long/url",  <- required
        "customAlias": "my-link",               <- optional
        "ttlDays": 30                           <- optional (default 365)
    }
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

# when running in Lambda, the shared layer is at /opt/python
# when running tests locally, we need to add the path manually
sys.path.insert(0, "/opt/python")

from utils import (
    GSI_PK_VALUE,
    build_response,
    generate_short_code,
    is_valid_alias,
    is_valid_url,
    ttl_timestamp,
)

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

# get the table name from environment variable - set by CDK during deploy
TABLE_NAME = os.environ["TABLE_NAME"]

# reuse the boto3 client across invocations (Lambda reuses the container)
# this is a common Lambda optimization tip
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

# max TTL I'm allowing - 10 years seems reasonable
MAX_TTL_DAYS = 3650


def lambda_handler(event, context):
    """Main function - Lambda calls this for every request"""

    logger.info("Got a shorten request")

    # --- parse the request body ---
    # event["body"] is a string so we need to parse it as JSON
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return build_response(400, {"error": "Request body must be valid JSON"})

    # pull out the fields from the body
    original_url = (body.get("url") or "").strip()
    custom_alias = (body.get("customAlias") or "").strip() or None
    ttl_days = int(body.get("ttlDays") or 365)

    # --- validate inputs ---
    if not original_url:
        return build_response(400, {"error": "Missing required field: url"})

    if not is_valid_url(original_url):
        return build_response(400, {"error": "Invalid URL - make sure it starts with http:// or https://"})

    if custom_alias and not is_valid_alias(custom_alias):
        return build_response(
            400,
            {"error": "Custom alias must be 3-30 characters (letters, numbers, hyphens only)"}
        )

    if not (1 <= ttl_days <= MAX_TTL_DAYS):
        return build_response(400, {"error": f"ttlDays must be between 1 and {MAX_TTL_DAYS}"})

    # --- figure out the short code ---
    # use the custom alias if provided, otherwise generate a random one
    if custom_alias:
        short_code = custom_alias
    else:
        short_code = find_unique_code()
        if short_code is None:
            # this basically never happens but handle it anyway
            logger.error("Failed to generate a unique code after multiple attempts")
            return build_response(500, {"error": "Could not generate a unique short code, try again"})

    created_at = datetime.now(timezone.utc).isoformat()

    # build the item we'll store in DynamoDB
    item = {
        "shortCode": short_code,        # primary key
        "pk": GSI_PK_VALUE,             # needed for the GSI (so we can list all URLs)
        "originalUrl": original_url,
        "createdAt": created_at,
        "clickCount": 0,
        "expiresAt": ttl_timestamp(ttl_days),   # DynamoDB TTL - auto-deletes after this
        "isCustomAlias": custom_alias is not None,
    }

    # --- save to DynamoDB ---
    # ConditionExpression makes sure we don't overwrite an existing short code
    # if the condition fails, DynamoDB throws ConditionalCheckFailedException
    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(shortCode)"
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "ConditionalCheckFailedException":
            # someone already has this alias
            return build_response(
                409,
                {"error": f"'{short_code}' is already taken, please choose a different alias"}
            )
        # something else went wrong
        logger.exception("DynamoDB error")
        return build_response(500, {"error": "Something went wrong, please try again"})

    logger.info("Created short code '%s' -> %s", short_code, original_url)

    # build the short URL - uses CloudFront domain if set, otherwise just the path
    cloudfront_domain = os.environ.get("CLOUDFRONT_DOMAIN", "")
    if cloudfront_domain:
        short_url = f"https://{cloudfront_domain}/{short_code}"
    else:
        short_url = f"/{short_code}"

    return build_response(
        201,  # 201 = Created (more accurate than 200 for new resources)
        {
            "shortCode": short_code,
            "shortUrl": short_url,
            "originalUrl": original_url,
            "createdAt": created_at,
        }
    )


def find_unique_code(max_attempts=5):
    """
    Try to find a short code that doesn't already exist in the database.
    Usually works on the first try since there are 62^7 possible codes.
    Returns None if we somehow can't find one (very unlikely).
    """
    for attempt in range(max_attempts):
        code = generate_short_code()

        # check if this code is already taken
        resp = table.get_item(
            Key={"shortCode": code},
            ProjectionExpression="shortCode",  # only fetch the key, saves bandwidth
        )

        if "Item" not in resp:
            return code  # found a free one!

        logger.warning("Code '%s' already taken, trying again (attempt %d)", code, attempt + 1)

    return None  # gave up after max_attempts tries
