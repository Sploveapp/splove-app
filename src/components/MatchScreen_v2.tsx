import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  type ImageSourcePropType,
} from 'react-native';

// Add `src/assets/heart-orbit.png` in your app (path relative to this file).
const heartOrbit = require('../assets/heart-orbit.png') as ImageSourcePropType;

export type MatchScreenV2Props = {
  leftProfileUri?: string | null;
  rightProfileUri?: string | null;
  onPressSendMessage?: () => void;
};

function CircularImage({
  uri,
  style,
}: {
  uri: string | null | undefined;
  style?: object;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const useRemote = Boolean(uri) && !failed;

  return (
    <View style={[styles.avatar, style]}>
      {useRemote ? (
        <Image
          source={{ uri: uri as string }}
          style={styles.avatarImage}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

export default function MatchScreen_v2({
  leftProfileUri,
  rightProfileUri,
  onPressSendMessage,
}: MatchScreenV2Props): React.ReactElement {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>C’est un match.</Text>
        <Text style={styles.subtitle}>Passe à l’action.</Text>

        <View style={styles.avatarsRow}>
          <CircularImage uri={leftProfileUri} style={styles.avatarLeft} />
          <View style={styles.logoSlot}>
            {logoFailed ? (
              <View style={styles.logoFallback}>
                <Text style={styles.logoFallbackText}>♥</Text>
              </View>
            ) : (
              <Image
                source={heartOrbit}
                style={styles.logo}
                resizeMode="contain"
                onError={() => setLogoFailed(true)}
              />
            )}
          </View>
          <CircularImage uri={rightProfileUri} style={styles.avatarRight} />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={onPressSendMessage}
        >
          <Text style={styles.buttonLabel}>Envoyer un message</Text>
        </Pressable>
      </View>
    </View>
  );
}

const AVATAR = 112;
const LOGO = 80;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    alignItems: 'center',
  },
  title: {
    color: '#F5F5F7',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    color: 'rgba(245, 245, 247, 0.64)',
    fontSize: 16,
    textAlign: 'center',
  },
  avatarsRow: {
    marginTop: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: '#1C1C24',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
  },
  avatarLeft: {
    marginRight: -18,
  },
  avatarRight: {
    marginLeft: -18,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  logoSlot: {
    width: LOGO,
    height: LOGO,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO,
    height: LOGO,
  },
  logoFallback: {
    width: LOGO,
    height: LOGO,
    borderRadius: LOGO / 2,
    backgroundColor: '#2A1020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#FF6B9A',
    fontSize: 32,
  },
  button: {
    marginTop: 48,
    width: '100%',
    maxWidth: 400,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonLabel: {
    color: '#0B0B0F',
    fontSize: 16,
    fontWeight: '600',
  },
});
