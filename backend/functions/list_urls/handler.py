"""
list_urls/handler.py

Handles GET /urls - returns all the short links for the dashboard.

This was actually tricky to implement because DynamoDB doesn't have a simple
"get all items" that's efficient. You can use Scan but that reads the whole table
which gets expensive at scale.

Instead I used a GSI (Global Secondary Index) with a fixed partition key (pk="URL").
Every item has pk="URL" so I can query the GSI to get all items sorted by createdAt.
This is called the "single table design" pattern - all items in one table.

I learned about this from the AWS DynamoDB best practices docs.

Query params:
    limit - how many results to return (default 50, max 200)
"""

import logging
import os
import sys

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

sys.path.insert(0, "/opt/python")

from utils import GSI_PK_VALUE, build_response

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

TABLE_NAME = os.environ["TABLE_NAME"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def lambda_handler(event, context):
    """Return a list of all short URLs, newest first"""

    # get the limit from query params if provided
    query_params = event.get("queryStringParameters") or {}
    try:
        limit = int(query_params.get("limit", DEFAULT_LIMIT))
        limit = min(limit, MAX_LIMIT)  # cap at MAX_LIMIT
    except (ValueError, TypeError):
        limit = DEFAULT_LIMIT

    logger.info("Listing URLs, limit=%d", limit)

    try:
        # query the GSI - all items have pk="URL" so this gets everything
        # ScanIndexForward=False means newest first (descending by createdAt)
        resp = table.query(
            IndexName="createdAt-index",
            KeyConditionExpression=Key("pk").eq(GSI_PK_VALUE),
            ScanIndexForward=False,
            Limit=limit,
        )
    except ClientError:
        logger.exception("DynamoDB error when listing URLs")
        return build_response(500, {"error": "Something went wrong"})

    items = resp.get("Items", [])

    # format the response - only include what the frontend needs
    urls = []
    for item in items:
        urls.append({
            "shortCode": item["shortCode"],
            "originalUrl": item["originalUrl"],
            "clickCount": int(item.get("clickCount", 0)),
            "createdAt": item.get("createdAt"),
            "isCustomAlias": item.get("isCustomAlias", False),
        })

    return build_response(200, {"urls": urls, "count": len(urls)})
