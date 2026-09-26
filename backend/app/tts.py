import io
import logging
from typing import Optional, Dict, Any, Tuple
from collections import OrderedDict
import threading

logger = logging.getLogger("nihon-tts")

MODELS = {
    "large": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "small": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
}

FIFO_CACHE_SIZE = 10
_tts_cache: OrderedDict[Tuple[str, str, str, str], bytes] = OrderedDict()
_cache_lock = threading.Lock()

_model_instances: Dict[str, Any] = {
    "large": None,
    "small": None,
}
_model_locks = {
    "large": threading.Lock(),
    "small": threading.Lock(),
}
_init_errors: Dict[str, Optional[str]] = {
    "large": None,
    "small": None,
}
_is_loading: Dict[str, bool] = {
    "large": False,
    "small": False,
}

def get_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
    except Exception:
        pass
    return "cpu"

def load_model(size: str = "large"):
    """Load Qwen3-TTS model into memory for requested size ('large' or 'small')."""
    model_size = "small" if "small" in size.lower() else "large"
    model_id = MODELS[model_size]

    if _model_instances[model_size] is not None:
        return _model_instances[model_size]

    with _model_locks[model_size]:
        if _model_instances[model_size] is not None:
            return _model_instances[model_size]

        _is_loading[model_size] = True
        try:
            import torch
            from qwen_tts import Qwen3TTSModel

            device = get_device()
            logger.info(f"Loading Qwen3-TTS {model_size} model ({model_id}) on {device}...")

            dtype = torch.bfloat16 if "cuda" in device else torch.float32
            model = Qwen3TTSModel.from_pretrained(
                model_id,
                device_map=device,
                dtype=dtype
            )
            _model_instances[model_size] = model
            _init_errors[model_size] = None
            logger.info(f"Qwen3-TTS {model_size} ({model_id}) loaded successfully.")
            return _model_instances[model_size]
        except Exception as e:
            _init_errors[model_size] = str(e)
            logger.error(f"Failed to load Qwen3-TTS {model_size} model: {e}")
            raise
        finally:
            _is_loading[model_size] = False

def is_tts_ready(size: str = "large") -> bool:
    model_size = "small" if "small" in size.lower() else "large"
    return _model_instances[model_size] is not None

def get_tts_status(size: str = "large") -> dict:
    model_size = "small" if "small" in size.lower() else "large"
    device = get_device()
    return {
        "available": is_tts_ready(model_size),
        "model": MODELS[model_size],
        "device": device,
        "is_loading": _is_loading[model_size],
        "error": _init_errors[model_size]
    }

def synthesize_speech(
    text: str,
    speaker: Optional[str] = None,
    instruction: Optional[str] = None,
    model_size: str = "large"
) -> bytes:
    """
    Synthesizes Japanese speech for given text using Qwen3-TTS (large or small).
    Returns audio as WAV bytes.
    """
    import soundfile as sf

    size = "small" if "small" in str(model_size).lower() else "large"
    default_instruct = instruction or "Speak clearly with accurate standard Japanese pronunciation and natural rhythm."
    chosen_speaker_key = speaker or "ono_anna"
    cache_key = (size, text.strip(), chosen_speaker_key, default_instruct)

    # 1. Check in-memory FIFO cache
    with _cache_lock:
        if cache_key in _tts_cache:
            logger.info(f"Serving Japanese speech from backend FIFO cache [{size}]: '{text[:30]}...'")
            return _tts_cache[cache_key]

    # 2. Run model inference if not cached
    model = load_model(size)

    # Determine default speaker if not provided (ono_anna is native Japanese speaker)
    chosen_speaker = speaker
    if not chosen_speaker:
        try:
            supported = model.get_supported_speakers()
            if "ono_anna" in supported:
                chosen_speaker = "ono_anna"
            elif supported and len(supported) > 0:
                chosen_speaker = supported[0]
            else:
                chosen_speaker = "ono_anna"
        except Exception:
            chosen_speaker = "ono_anna"

    logger.info(f"Synthesizing Japanese speech [{size}]: '{text[:30]}...' [speaker={chosen_speaker}]")

    wavs, sr = model.generate_custom_voice(
        text=text,
        language="Japanese",
        speaker=chosen_speaker,
        instruct=default_instruct
    )

    audio_data = wavs[0] if isinstance(wavs, list) else wavs

    buffer = io.BytesIO()
    sf.write(buffer, audio_data, sr, format="WAV")
    wav_bytes = buffer.getvalue()

    # 3. Store in FIFO cache, evicting the oldest entry if capacity reached
    with _cache_lock:
        if len(_tts_cache) >= FIFO_CACHE_SIZE:
            evicted_key, _ = _tts_cache.popitem(last=False)  # FIFO pop oldest
            logger.debug(f"FIFO cache evicted oldest entry: {evicted_key[1][:20]}")
        _tts_cache[cache_key] = wav_bytes

    return wav_bytes
