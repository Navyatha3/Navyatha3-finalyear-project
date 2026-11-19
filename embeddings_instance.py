from langchain_huggingface import HuggingFaceEmbeddings

EMBEDDING_MODEL_NAME = "BAAI/bge-large-en-v1.5"

# We use a global variable to ensure the model stays in memory and is never reloaded
_model_instance = None


def get_embeddings():
    global _model_instance
    if _model_instance is None:
        print(f"🔌 [MEMORY SAFE] Loading Shared Embedding Model: {EMBEDDING_MODEL_NAME}...")
        _model_instance = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL_NAME,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return _model_instance


# This allows other files to use 'from app.services.embeddings_instance import embeddings'
# while still benefiting from the singleton pattern
class EmbeddingsProxy:
    def __getattr__(self, name):
        return getattr(get_embeddings(), name)

    def __call__(self, *args, **kwargs):
        return get_embeddings()(*args, **kwargs)

    # Explicitly map common LangChain methods to the instance
    def embed_documents(self, texts):
        return get_embeddings().embed_documents(texts)

    def embed_query(self, text):
        return get_embeddings().embed_query(text)


embeddings = EmbeddingsProxy()
