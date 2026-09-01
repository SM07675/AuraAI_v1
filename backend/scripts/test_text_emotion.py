"""
Test script for Text Emotion Analyzer with local RoBERTa model.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.emotion.analyzers import TextEmotionAnalyzer

def main():
    print("=" * 60)
    print("TESTING TEXT EMOTION ANALYZER (Local RoBERTa Model)")
    print("=" * 60)
    
    analyzer = TextEmotionAnalyzer(use_llm=False)
    print(f"Local Model Loaded: {analyzer.is_local_model_loaded()}")
    print(f"Device: {analyzer._device}")
    print(f"Model Labels: {analyzer._model_labels}")
    
    test_cases = [
        ("I am having such a wonderful day and feeling fantastic!", "happy"),
        ("I feel so depressed, lonely and everything is falling apart.", "sad"),
        ("I am furious and outraged that they canceled my flight without notice!", "angry"),
        ("I am terrified about my upcoming presentation, what if I fail?", "anxious/fearful"),
        ("The report was submitted on Tuesday as requested.", "neutral"),
    ]
    
    import asyncio
    
    async def run_tests():
        all_passed = True
        for text, expected_label in test_cases:
            res = await analyzer.analyze(text)
            print(f"\nText: \"{text}\"")
            print(f"  -> Predicted: {res.emotion} (Conf: {res.confidence}%, Sentiment: {res.sentiment}, Stress: {res.stress_level})")
            print(f"  -> Scores: {res.scores}")
            print(f"  -> Expected: {expected_label}")
            if res.confidence <= 0 or not res.scores:
                all_passed = False
                
        print("\n" + "=" * 60)
        if all_passed and analyzer.is_local_model_loaded():
            print("[PASS] Text emotion model inference verified successfully!")
        else:
            print("[FAIL] Text emotion model failed or not loaded.")
        print("=" * 60)
        
    asyncio.run(run_tests())

if __name__ == "__main__":
    main()
