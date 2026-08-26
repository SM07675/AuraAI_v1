from app.services.conversation_service import normalize_response_language


def test_normalize_response_language():
    assert normalize_response_language("hi-IN") == "hi-IN"
    assert normalize_response_language(" HI ") == "hi-IN"
    assert normalize_response_language("en-IN") == "en-IN"
    assert normalize_response_language("unsupported") is None
    assert normalize_response_language(None) is None
