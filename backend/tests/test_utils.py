"""Tests for shared utility functions."""

from __future__ import annotations

import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

from utils import (
    generate_short_code,
    is_valid_alias,
    is_valid_url,
    ttl_timestamp,
    build_response,
    build_redirect,
)


class TestGenerateShortCode:
    def test_returns_7_characters(self):
        code = generate_short_code()
        assert len(code) == 7

    def test_only_alphanumeric(self):
        for _ in range(50):
            code = generate_short_code()
            assert code.isalnum(), f"Non-alphanumeric code: {code}"

    def test_generates_unique_codes(self):
        codes = {generate_short_code() for _ in range(100)}
        assert len(codes) > 95, "Too many collisions — entropy too low"


class TestIsValidUrl:
    def test_valid_https(self):
        assert is_valid_url("https://example.com") is True

    def test_valid_http(self):
        assert is_valid_url("http://example.com/path?q=1") is True

    def test_valid_with_port(self):
        assert is_valid_url("http://localhost:3000") is True

    def test_invalid_no_scheme(self):
        assert is_valid_url("example.com") is False

    def test_invalid_ftp(self):
        assert is_valid_url("ftp://example.com") is False

    def test_invalid_empty(self):
        assert is_valid_url("") is False

    def test_invalid_just_text(self):
        assert is_valid_url("not a url at all") is False


class TestIsValidAlias:
    def test_valid_simple(self):
        assert is_valid_alias("my-link") is True

    def test_valid_alphanumeric(self):
        assert is_valid_alias("abc123") is True

    def test_invalid_too_short(self):
        assert is_valid_alias("ab") is False

    def test_invalid_too_long(self):
        assert is_valid_alias("a" * 31) is False

    def test_invalid_special_chars(self):
        assert is_valid_alias("my_link!") is False

    def test_invalid_space(self):
        assert is_valid_alias("my link") is False

    def test_valid_exactly_3_chars(self):
        assert is_valid_alias("abc") is True

    def test_valid_exactly_30_chars(self):
        assert is_valid_alias("a" * 30) is True


class TestTtlTimestamp:
    def test_returns_future_timestamp(self):
        ts = ttl_timestamp(7)
        assert ts > int(time.time())

    def test_approximately_correct(self):
        ts = ttl_timestamp(1)
        expected = int(time.time()) + 86_400
        assert abs(ts - expected) < 5  # within 5 seconds


class TestBuildResponse:
    def test_status_code(self):
        resp = build_response(200, {"ok": True})
        assert resp["statusCode"] == 200

    def test_body_is_json_string(self):
        import json
        resp = build_response(200, {"key": "value"})
        body = json.loads(resp["body"])
        assert body["key"] == "value"

    def test_cors_header_present(self):
        resp = build_response(200, {})
        assert resp["headers"]["Access-Control-Allow-Origin"] == "*"

    def test_extra_headers_merged(self):
        resp = build_response(200, {}, extra_headers={"X-Custom": "yes"})
        assert resp["headers"]["X-Custom"] == "yes"


class TestBuildRedirect:
    def test_status_code_301(self):
        resp = build_redirect("https://example.com")
        assert resp["statusCode"] == 301

    def test_location_header(self):
        resp = build_redirect("https://example.com/path")
        assert resp["headers"]["Location"] == "https://example.com/path"
