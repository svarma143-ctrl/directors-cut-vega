import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { SpatialNavigationRoot } from 'react-tv-space-navigation';
import { useIsFocused } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';

import DirectorPanel from '../components/director/DirectorPanel';
import useDirector from '../hooks/useDirector';
import { DEMO_MEDIA } from '../data/demoMedia';
import type { TriviaQuestion } from '../types/director';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { safeZones } from '../theme/safeZones';

/**
 * Director's Cut - the AI companion screen.
 *
 * This is the surface the whole project is about: a living-room companion
 * that answers questions about what you have just watched, and never about
 * what is coming next.
 *
 * The screen is a split view: the video occupies the left, and the companion
 * panel sits on the right. The panel is driven by the same playhead the
 * video player reports, so the grounding is exact.
 */

export interface DirectorScreenProps {
  /** Playback position in seconds, shared with the player. */
  playhead: number;
  /** Total duration in seconds. */
  duration: number;
  /** True while the video is playing. */
  playing: boolean;
  /** Called when the viewer asks to hide the companion. */
  onDismiss?: () => void;
}

export const DirectorScreen: React.FC<DirectorScreenProps> = ({
  playhead,
  duration,
  playing,
  onDismiss,
}) => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [revealedId, setRevealedId] = useState<string | null>(null);

  const { response, loading, offline } = useDirector({
    title: DEMO_MEDIA.title,
    subtitle: DEMO_MEDIA.subtitle,
    duration: duration || DEMO_MEDIA.duration,
    playhead,
    cues: DEMO_MEDIA.cues,
    active: playing && isFocused,
  });

  // A new set of questions means the previously revealed answer no longer
  // applies, so clear it.
  const responseId = response?.questions.map((q) => q.id).join(',') ?? '';
  useEffect(() => {
    setRevealedId(null);
  }, [responseId]);

  const handleSelectQuestion = useCallback((question: TriviaQuestion) => {
    setRevealedId((current) => (current === question.id ? null : question.id));
  }, []);

  const handleBack = useCallback(() => {
    if (revealedId) {
      setRevealedId(null);
      return;
    }
    if (onDismiss) {
      onDismiss();
      return;
    }
    navigation.goBack();
  }, [revealedId, onDismiss, navigation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleBack();
        return true;
      },
    );
    return () => backHandler.remove();
  }, [handleBack]);

  return (
    <SpatialNavigationRoot isActive={isFocused}>
      <View style={styles.container}>
        <DirectorPanel
          response={response}
          loading={loading}
          offline={offline}
          onSelectQuestion={handleSelectQuestion}
          revealedId={revealedId}
          playhead={playhead}
        />
      </View>
    </SpatialNavigationRoot>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default DirectorScreen;
