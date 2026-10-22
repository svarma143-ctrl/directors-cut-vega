import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { safeZones } from '../../theme/safeZones';
import { scaledPixels } from '../../hooks/useScale';
import type {
  ContextNote,
  DirectorResponse,
  TriviaQuestion,
} from '../../types/director';

/**
 * The Director's Cut panel.
 *
 * This is the "companion" surface that sits alongside the video. It shows:
 *   - a live context note ("what's happening right now")
 *   - trivia questions about what has already happened
 *
 * Two design rules drive the implementation:
 *
 * 1. **10-foot legibility.** Sizes are expressed against the shared UI's
 *    1920x1080 design resolution and converted with `scaledPixels`, which
 *    maps them to the device's own pixel density. Typography is never
 *    smaller than the app's body size.
 *
 * 2. **Honesty about provenance.** When the agent returns its deterministic
 *    fallback instead of a live model response, the panel says so. A demo
 *    that quietly presents canned output as AI is a demo that gets caught.
 */

export interface DirectorPanelProps {
  /** The latest response, or null while loading / when offline. */
  response: DirectorResponse | null;
  /** True while a request is in flight. */
  loading: boolean;
  /** True when the agent could not be reached at all. */
  offline: boolean;
  /** Called when the user selects a question to reveal its answer. */
  onSelectQuestion: (question: TriviaQuestion) => void;
  /** Id of the question whose answer is currently revealed. */
  revealedId?: string | null;
  /** Playhead position in seconds, shown so the user can see the grounding. */
  playhead: number;
}

/** Design-space width of the companion panel, in 1920x1080 pixels. */
const PANEL_WIDTH = 600;

export const DirectorPanel: React.FC<DirectorPanelProps> = ({
  response,
  loading,
  offline,
  onSelectQuestion,
  revealedId,
  playhead,
}) => {
  const context: ContextNote | undefined = response?.context;
  const questions = response?.questions ?? [];
  const isFallback = response?.fallback ?? false;

  return (
    <View style={styles.panel} testID="director-panel">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>DIRECTOR&apos;S CUT</Text>
        <View style={styles.headerRight}>
          {offline ? (
            <Text style={styles.statusOffline}>OFFLINE</Text>
          ) : isFallback ? (
            <Text style={styles.statusFallback}>LOCAL</Text>
          ) : (
            <Text style={styles.statusLive}>AI</Text>
          )}
          {loading && <View style={styles.loadingDot} />}
        </View>
      </View>

      <Text style={styles.playhead}>
        {formatTime(playhead)} watched
      </Text>

      {context && (
        <View style={styles.contextBlock} testID="director-context">
          <Text style={styles.contextTitle}>{context.title}</Text>
          <Text style={styles.contextBody}>{context.body}</Text>
        </View>
      )}

      {questions.length > 0 && (
        <View style={styles.questionsBlock}>
          <Text style={styles.sectionHeading}>QUIZ</Text>
          {questions.map((question, index) => {
            const revealed = revealedId === question.id;
            return (
              <TouchableOpacity
                key={question.id}
                style={[styles.questionCard, revealed && styles.questionCardRevealed]}
                onPress={() => onSelectQuestion(question)}
                accessibilityRole="button"
                accessibilityLabel={question.question}
                hasTVPreferredFocus={index === 0}
                testID={`director-question-${index}`}>
                <Text style={styles.questionText}>{question.question}</Text>

                {revealed && question.options.length > 0 && (
                  <View style={styles.optionsBlock}>
                    {question.options.map((option, optionIndex) => {
                      const isCorrect = optionIndex === question.correctIndex;
                      return (
                        <Text
                          key={option}
                          style={[
                            styles.optionText,
                            isCorrect && styles.optionCorrect,
                          ]}>
                          {String.fromCharCode(65 + optionIndex)}. {option}
                          {isCorrect ? '  ✓' : ''}
                        </Text>
                      );
                    })}
                  </View>
                )}

                {revealed && question.explanation && (
                  <Text style={styles.explanation}>{question.explanation}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {offline && (
        <Text style={styles.emptyText}>
          The companion is offline. Start the agent and the panel will connect.
        </Text>
      )}

      {!offline && !loading && !context && questions.length === 0 && (
        <Text style={styles.emptyText}>
          No questions yet for this point in the story.
        </Text>
      )}
    </View>
  );
};

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  panel: {
    width: scaledPixels(PANEL_WIDTH),
    height: '100%',
    // Fully opaque: the video surface can extend underneath the panel on
    // some renderers, and a translucent panel would let the video bleed
    // through the text.
    backgroundColor: colors.background,
    borderLeftWidth: scaledPixels(2),
    borderLeftColor: colors.border,
    paddingTop: scaledPixels(safeZones.actionSafe.vertical),
    paddingBottom: scaledPixels(safeZones.actionSafe.vertical),
    paddingLeft: scaledPixels(36),
    paddingRight: scaledPixels(safeZones.actionSafe.horizontal),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scaledPixels(8),
  },
  headerTitle: {
    color: colors.text,
    fontSize: scaledPixels(typography.fontSize.md),
    fontWeight: typography.fontWeight.bold,
    letterSpacing: scaledPixels(2),
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // A small pulsing dot, rather than ActivityIndicator: on Vega the
  // ActivityIndicator renders at an unexpectedly large size and collides
  // with the status badge.
  loadingDot: {
    width: scaledPixels(10),
    height: scaledPixels(10),
    borderRadius: scaledPixels(5),
    marginLeft: scaledPixels(10),
    backgroundColor: colors.text,
  },
  statusLive: {
    color: colors.success,
    fontSize: scaledPixels(typography.fontSize.sm),
    fontWeight: typography.fontWeight.bold,
    letterSpacing: scaledPixels(1),
  },
  statusFallback: {
    color: colors.warning,
    fontSize: scaledPixels(typography.fontSize.sm),
    fontWeight: typography.fontWeight.bold,
    letterSpacing: scaledPixels(1),
  },
  statusOffline: {
    color: colors.textTertiary,
    fontSize: scaledPixels(typography.fontSize.sm),
    fontWeight: typography.fontWeight.bold,
    letterSpacing: scaledPixels(1),
  },
  playhead: {
    color: colors.textTertiary,
    fontSize: scaledPixels(typography.fontSize.sm),
    marginBottom: scaledPixels(20),
  },
  contextBlock: {
    backgroundColor: colors.card,
    borderRadius: scaledPixels(16),
    padding: scaledPixels(24),
    marginBottom: scaledPixels(24),
  },
  contextTitle: {
    color: colors.info,
    fontSize: scaledPixels(typography.fontSize.md),
    fontWeight: typography.fontWeight.bold,
    marginBottom: scaledPixels(10),
  },
  contextBody: {
    color: colors.text,
    fontSize: scaledPixels(typography.fontSize.md),
    lineHeight: scaledPixels(typography.fontSize.md * typography.lineHeight.normal),
  },
  questionsBlock: {
    flex: 1,
  },
  sectionHeading: {
    color: colors.textSecondary,
    fontSize: scaledPixels(typography.fontSize.sm),
    fontWeight: typography.fontWeight.bold,
    letterSpacing: scaledPixels(2),
    marginBottom: scaledPixels(12),
  },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: scaledPixels(16),
    borderWidth: scaledPixels(3),
    borderColor: 'transparent',
    padding: scaledPixels(20),
    marginBottom: scaledPixels(14),
  },
  questionCardRevealed: {
    borderColor: colors.focusBorder,
  },
  questionText: {
    color: colors.text,
    fontSize: scaledPixels(typography.fontSize.md),
    lineHeight: scaledPixels(typography.fontSize.md * typography.lineHeight.normal),
  },
  optionsBlock: {
    marginTop: scaledPixels(14),
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: scaledPixels(typography.fontSize.md),
    lineHeight: scaledPixels(typography.fontSize.md * typography.lineHeight.normal),
  },
  optionCorrect: {
    color: colors.success,
    fontWeight: typography.fontWeight.bold,
  },
  explanation: {
    color: colors.textSecondary,
    fontSize: scaledPixels(typography.fontSize.sm),
    marginTop: scaledPixels(12),
    fontStyle: 'italic',
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: scaledPixels(typography.fontSize.sm),
    marginTop: scaledPixels(24),
    lineHeight: scaledPixels(typography.fontSize.sm * typography.lineHeight.normal),
  },
});

export default DirectorPanel;
