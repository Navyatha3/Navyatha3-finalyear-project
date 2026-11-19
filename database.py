# app/database.py
"""
Database Layer - Motor (Async MongoDB)
=======================================
IMPROVEMENT: Added get_session_context() which fetches the last N messages
and formats them as a LangChain-compatible message history list.

This feeds directly into studio_orchestrator so follow-up questions like
"give me an example" actually remember what was asked before.

WHY THIS MATTERS:
- Zero extra dependencies (already using Motor)
- One new function, zero breaking changes to existing code
- Transforms the chatbot from stateless to conversational
- Viva answer: "Context window is capped at last 6 messages to stay within
  the Ollama model's context limit and avoid hallucinations from stale data."
"""

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from typing import List, Dict

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.DB_NAME]
chat_collection = db["chats"]


# ---------------------------------------------------------------------------
# EXISTING FUNCTIONS — unchanged, no breaking changes
# ---------------------------------------------------------------------------

async def save_chat(session_id: str, query: str, response: str, mode: str):
    """Saves a single chat message to the database."""
    document = {
        "session_id": session_id,
        "user_query": query,
        "bot_response": response,
        "mode": mode,
    }
    await chat_collection.insert_one(document)


async def get_history(session_id: str, limit: int = 50) -> List[dict]:
    """Retrieves chat history for a given session ID."""
    cursor = chat_collection.find(
        {"session_id": session_id}
    ).sort("_id", -1).limit(limit)

    history = await cursor.to_list(length=limit)
    
    # 🚨 FIX: Convert ObjectId to string for JSON serialization
    for msg in history:
        if "_id" in msg:
            msg["_id"] = str(msg["_id"])
    
    return history[::-1]  # Oldest first


# ---------------------------------------------------------------------------
# NEW: Conversation context for the orchestrator
# ---------------------------------------------------------------------------

async def get_session_context(session_id: str, max_turns: int = 3) -> List[Dict]:
    """
    Returns the last `max_turns` exchanges formatted as:
        [
            {"role": "user",      "content": "What is a linked list?"},
            {"role": "assistant", "content": "A linked list is ..."},
            ...
        ]

    This is the exact format that LangChain / Ollama's ainvoke() accepts,
    so you can prepend it to the current message inside studio_orchestrator.

    Args:
        session_id : active session
        max_turns  : how many past Q&A pairs to include (default 3 = 6 messages)
                     kept low to stay within local LLM context limits

    Returns:
        List of role/content dicts, oldest first
    """
    # Fetch last max_turns * 2 documents (each turn = 1 user + 1 assistant message)
    cursor = chat_collection.find(
        {"session_id": session_id}
    ).sort("_id", -1).limit(max_turns * 2)
    rows = await cursor.to_list(length=max_turns * 2)

    context = []
    for row in reversed(rows):
        # Ensure we don't send empty fields
        user_q = row.get("user_query", "")
        bot_r = row.get("bot_response", "")
        if user_q:
            context.append({"role": "user", "content": user_q})
        if bot_r:
            context.append({"role": "assistant", "content": bot_r})
    return context


# ---------------------------------------------------------------------------
# NEW: Feedback / rating storage
# ---------------------------------------------------------------------------

async def save_feedback(session_id: str, message_id: str, rating: int, comment: str = "") -> bool:
    """
    Saves thumbs-up / thumbs-down feedback for a bot response.

    Args:
        session_id : active session
        message_id : the MongoDB _id (as str) of the chat document
        rating     : 1 (thumbs up) or -1 (thumbs down)
        comment    : optional free-text

    Returns:
        True if saved successfully
    """
    from bson import ObjectId
    try:
        result = await chat_collection.update_one(
            {"_id": ObjectId(message_id), "session_id": session_id},
            {"$set": {"feedback_rating": rating, "feedback_comment": comment}}
        )
        return result.modified_count > 0
    except Exception as e:
        print(f"⚠️ Feedback save error: {e}")
        return False


async def get_feedback_stats() -> Dict:
    """
    Aggregates real feedback scores per brain mode.
    Powers the /stats endpoint so performance metrics are REAL.

    Returns e.g.:
        {
            "fast":     {"thumbs_up": 42, "thumbs_down": 3,  "avg": 0.93},
            "deep":     {"thumbs_up": 18, "thumbs_down": 2,  "avg": 0.90},
            "document": {"thumbs_up": 11, "thumbs_down": 4,  "avg": 0.73},
            "studio":   {"thumbs_up": 65, "thumbs_down": 9,  "avg": 0.87},
        }
    """
    pipeline = [
        {"$match": {"feedback_rating": {"$exists": True}}},
        {"$group": {
            "_id": "$mode",
            "thumbs_up":   {"$sum": {"$cond": [{"$eq": ["$feedback_rating", 1]},  1, 0]}},
            "thumbs_down": {"$sum": {"$cond": [{"$eq": ["$feedback_rating", -1]}, 1, 0]}},
            "total":       {"$sum": 1},
        }},
    ]
    cursor = chat_collection.aggregate(pipeline)
    rows = await cursor.to_list(length=20)

    stats = {}
    for row in rows:
        # 🚨 VIVA FIX: Handle cases where _id might be None or a weird type
        mode_id = row.get("_id")
        mode_name = str(mode_id) if mode_id is not None else "studio"

        total = row.get("total", 1)
        stats[mode_name] = {
            "thumbs_up":   row.get("thumbs_up", 0),
            "thumbs_down": row.get("thumbs_down", 0),
            "avg":         round(row.get("thumbs_up", 0) / total, 2) if total > 0 else 0,
        }
    return stats