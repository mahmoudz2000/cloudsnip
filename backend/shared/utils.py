"""
utils.py - shared helper functions used by all the Lambda functions

I put common stuff here so I don't repeat myself across the 4 functions.
Things like URL validation, generating the short code, building API responses, etc.
"""

import json
import logging
import os
import random
import re
import string
import time

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

# the short codes are 7 characters - seemed like a good balance between
# short and having enough combinations (62^7 = ~3.5 trillion possible codes)
_ALPHABET = string.ascii_letters + string.digits
_CODE_LENGTH = 7

# this is used as the partition key value for the GSI so we can list all URLs
# basically every item has pk="URL" which lets us query by createdAt
# learned about this pattern from the DynamoDB docs - single table design
GSI_PK_VALUE = "URL"


def generate_short_code():
    """Generate a random 7-character alphanumeric code like 'xK9mPqR'"""
    return "".join(random.choices(_ALPHABET, k=_CODE_LENGTH))


def is_valid_url(url):
    """
    Check if a URL is valid - must start with http:// or https://

    Not perfect validation but good enough for this project.
    Rejects things like 'example.com' (no scheme) or 'ftp://...'
    """
    pattern = re.compile(
        r"^https?://"
        r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|"
        r"localhost|"
        r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"
        r"(?::\d+)?"
        r"(?:/?|[/?]\S+)$",
        re.IGNORECASE,
    )
    return bool(pattern.match(url))


def is_valid_alias(alias):
    """
    Custom aliases must be 3-30 chars, only letters/digits/hyphens.
    No spaces or special chars - keeps the URL clean.
    """
    return bool(re.match(r"^[a-zA-Z0-9-]{3,30}$", alias))


def ttl_timestamp(days):
    """
    Returns a Unix timestamp X days from now.
    DynamoDB uses this for TTL - it automatically deletes items after this time.
    Took me a bit to realize it needs to be in SECONDS not milliseconds!
    """
    return int(time.time()) + days * 86_400  # 86400 seconds in a day


def build_response(status_code, body, extra_headers=None):
    """
    Build the response dict that API Gateway expects.

    Every Lambda behind API Gateway needs to return this specific format
    with statusCode, headers, and body (body must be a string, not a dict).

    Also adding CORS headers here so the frontend can talk to the API.
    Without these I was getting blocked by the browser - CORS debugging was painful lol
    """
    headers = {
        "Content-Type": "application/json",
        # these CORS headers are needed so the React frontend can call the API
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    }

    # merge in any extra headers if provided
    if extra_headers:
        headers.update(extra_headers)

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body),  # must be a string!
    }


def build_redirect(location):
    """
    Returns a 301 redirect response.
    301 = permanent redirect. The browser will go to 'location' automatically.
    """
    return {
        "statusCode": 301,
        "headers": {
            "Location": location,
            "Access-Control-Allow-Origin": "*",
        },
        "body": "",
    }
