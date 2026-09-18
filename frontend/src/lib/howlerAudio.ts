import { Howl } from 'howler';
import { AudioSettings, SoundProfile } from './types';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  profile: 'thock',
  keyVolume: 0.7,
  errorVolume: 0.6,
  chimeVolume: 0.7,
};

class HowlerAudioEngine {
  private keySounds: Record<string, Howl> = {};
  private errorSound: Howl | null = null;
  private chimeSound: Howl | null = null;
  private victorySound: Howl | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private isInitialized = false;

  private initHowls() {
    if (this.isInitialized || typeof window === 'undefined') return;

    this.keySounds['thock'] = new Howl({
      src: ['/sounds/thock.wav'],
      volume: this.settings.keyVolume,
      preload: true,
    });

    this.keySounds['blue'] = new Howl({
      src: ['/sounds/blue.wav'],
      volume: this.settings.keyVolume,
      preload: true,
    });

    this.keySounds['brown'] = new Howl({
      src: ['/sounds/brown.wav'],
      volume: this.settings.keyVolume,
      preload: true,
    });

    this.errorSound = new Howl({
      src: ['/sounds/error.wav'],
      volume: this.settings.errorVolume,
      preload: true,
    });

    this.chimeSound = new Howl({
      src: ['/sounds/chime.wav'],
      volume: this.settings.chimeVolume,
      preload: true,
    });

    this.victorySound = new Howl({
      src: ['/sounds/victory.wav'],
      volume: this.settings.chimeVolume,
      preload: true,
    });

    this.isInitialized = true;
  }

  public setSettings(settings: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...settings };
    if (this.isInitialized) {
      if (settings.keyVolume !== undefined) {
        Object.values(this.keySounds).forEach((h) => h.volume(this.settings.keyVolume));
      }
      if (settings.errorVolume !== undefined && this.errorSound) {
        this.errorSound.volume(this.settings.errorVolume);
      }
      if (settings.chimeVolume !== undefined) {
        if (this.chimeSound) this.chimeSound.volume(this.settings.chimeVolume);
        if (this.victorySound) this.victorySound.volume(this.settings.chimeVolume);
      }
    }
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public playKeystroke(profile?: SoundProfile) {
    if (!this.settings.enabled || this.settings.keyVolume <= 0) return;
    this.initHowls();
    const chosenProfile = profile || this.settings.profile;
    const howl = this.keySounds[chosenProfile];
    if (howl) {
      howl.play();
    }
  }

  public playError() {
    if (!this.settings.enabled || this.settings.errorVolume <= 0) return;
    this.initHowls();
    if (this.errorSound) {
      this.errorSound.play();
    }
  }

  public playSentenceComplete() {
    if (!this.settings.enabled || this.settings.chimeVolume <= 0) return;
    this.initHowls();
    if (this.chimeSound) {
      this.chimeSound.play();
    }
  }

  public playPassageVictory() {
    if (!this.settings.enabled || this.settings.chimeVolume <= 0) return;
    this.initHowls();
    if (this.victorySound) {
      this.victorySound.play();
    }
  }
}

export const howlerAudio = new HowlerAudioEngine();
