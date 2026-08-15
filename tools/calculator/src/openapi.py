"""The OpenAPI document, BUILT FROM THE LOADED PACK rather than written alongside it.

A hand-maintained spec is a second copy of the truth, and the copy nobody executes is the one that
goes stale — this repository has the scars: a manifest comment naming the newest GeoServer version,
a docs line claiming a test count, a log message naming a raster it was no longer reading. So the
production types, the indicators and the board size in here are read off the pack at startup.
Change the pack and the spec follows.
"""


def openapi(pack):
    types = pack["productionTypes"]
    second = types[1]["id"] if len(types) > 1 else types[0]["id"]
    return {
        "openapi": "3.1.0",
        "info": {
            "title": "esgame static calculator",
            "version": "1.0.0",
            "description": (
                f'Scores allocations against the "{pack["name"]}" board.\n\n'
                "The model is the 2013 static game's own calculator, extracted from "
                "`calc_files/game.js` — whose first line says it \"will be used in the backend to "
                "calculate overall scores\". This is that backend.\n\n"
                f'The board is {pack["cols"]} x {pack["rows"]} cells, addressed from (1, 1). '
                f'A production placement covers a {pack["placementSize"]} x {pack["placementSize"]} '
                "block extending right and down; a set-aside removes a single cell."),
        },
        "paths": {
            "/score": {
                "post": {
                    "summary": "Score one allocation",
                    "operationId": "score",
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {
                            "schema": {"$ref": "#/components/schemas/ScoreRequest"},
                            "examples": {"one": {
                                "summary": "A farm and a ranch, with one set-aside",
                                "value": {
                                    "allocation": [
                                        {"type": types[0]["id"], "x": 10, "y": 10},
                                        {"type": second, "x": 14, "y": 12}],
                                    "setAsides": [{"x": 11, "y": 11}]}}}}},
                    },
                    "responses": {
                        "200": {"description": "The allocation scored",
                                "content": {"application/json": {
                                    "schema": {"$ref": "#/components/schemas/ScoreResponse"}}}},
                        "400": {"description": "The allocation cannot be scored — an unknown "
                                               "production type, or a placement off the board",
                                "content": {"application/json": {
                                    "schema": {"$ref": "#/components/schemas/Error"}}}},
                    },
                }
            },
            "/pack": {
                "get": {
                    "summary": "The board and model this service is scoring with",
                    "operationId": "pack",
                    "responses": {"200": {"description": "The pack, without its grids",
                                          "content": {"application/json": {"schema": {"type": "object"}}}}},
                }
            },
            "/health": {
                "get": {
                    "summary": "Liveness",
                    "operationId": "health",
                    "responses": {"200": {"description": "The service is up and a pack is loaded",
                                          "content": {"application/json": {"schema": {
                                              "type": "object",
                                              "properties": {"status": {"type": "string"},
                                                             "pack": {"type": "string"}}}}}}},
                }
            },
        },
        "components": {
            "schemas": {
                "Placement": {
                    "type": "object", "required": ["type"],
                    "description":
                        "Either an anchor (x, y) or the cells the piece covers. The anchor is the "
                        f'2013 form and grows into a {pack["placementSize"]} x {pack["placementSize"]} '
                        "block extending right and down. The cell form can express a piece some of "
                        "whose cells have been given back, which an anchor cannot say.",
                    "oneOf": [{"required": ["x", "y"]}, {"required": ["cells"]}],
                    "properties": {
                        "type": {"type": "string", "enum": [t["id"] for t in types],
                                 "description": "; ".join(f'`{t["id"]}` — {t["name"]}' for t in types)},
                        "x": {"type": "integer", "minimum": 1, "maximum": pack["cols"],
                              "description": "Column, from 1"},
                        "y": {"type": "integer", "minimum": 1, "maximum": pack["rows"],
                              "description": "Row, from 1"},
                        "cells": {"type": "array", "minItems": 1,
                                  "items": {"$ref": "#/components/schemas/Cell"},
                                  "description":
                                      "The cells this piece covers. They must all fit inside one "
                                      f'{pack["placementSize"]} x {pack["placementSize"]} footprint.'},
                    },
                },
                "Cell": {
                    "type": "object", "required": ["x", "y"],
                    "properties": {
                        "x": {"type": "integer", "minimum": 1, "maximum": pack["cols"]},
                        "y": {"type": "integer", "minimum": 1, "maximum": pack["rows"]},
                    },
                },
                "ScoreRequest": {
                    "type": "object", "required": ["allocation"],
                    "properties": {
                        "allocation": {"type": "array",
                                       "items": {"$ref": "#/components/schemas/Placement"}},
                        "setAsides": {"type": "array", "items": {"$ref": "#/components/schemas/Cell"},
                                      "description": "Cells removed from every production type "
                                                     "before scoring"},
                        "validation": {
                            "type": "boolean", "default": True,
                            "description":
                                "Reject cells off the board, cells claimed by two pieces, and a "
                                "piece whose footprint exceeds "
                                f'{pack["placementSize"]} x {pack["placementSize"]}. '
                                "In the 2013 game the PAGE enforced these; a service reachable by "
                                "anything else must. Set false to score exactly what "
                                "calc_files/game.js scores, which counts overlapping cells twice "
                                "— off-board cells are refused either way, since the original "
                                "returns NaN there and no caller can act on that."},
                    },
                },
                "ScoreResponse": {
                    "type": "object",
                    "properties": {
                        "score": {"type": "number", "description": "positive - negative"},
                        "positive": {"type": "number", "description": "Total production"},
                        "negative": {"type": "number",
                                     "description": "Total ecosystem-service cost"},
                        "production": {"type": "object", "description": "Production per type",
                                       "properties": {t["id"]: {"type": "number",
                                                                "description": t["name"]}
                                                      for t in types}},
                        "indicators": {"type": "object", "description": "Cost per indicator",
                                       "properties": {i["id"]: {"type": "number",
                                                                "description": i["name"]}
                                                      for i in pack["indicators"]}},
                        "cells": {"type": "object",
                                  "description": "How many cells each production type covered"},
                    },
                },
                "Error": {"type": "object", "properties": {"error": {"type": "string"}}},
            }
        },
    }
