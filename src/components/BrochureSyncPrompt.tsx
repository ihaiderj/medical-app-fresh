import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrochureComparisonService, BrochureDifferenceSummary } from '../services/brochureComparisonService';
import { BrochureData } from '../services/brochureManagementService';
import { BrochureSyncData } from '../services/brochureSyncService';
import { isTablet } from '../utils/responsive';

interface BrochureSyncPromptProps {
  visible: boolean;
  type: 'update' | 'new' | 'download';
  brochureId: string;
  brochureTitle: string;
  onUpdateNow?: () => void;
  onKeepLocal?: () => void;
  onUpdateLater?: () => void;
  onDownloadNow?: () => void;
  onDownloadLater?: () => void;
  onDismiss: () => void;
  differences?: BrochureDifferenceSummary;
  localBrochure?: BrochureData;
  serverBrochure?: BrochureSyncData;
}

export default function BrochureSyncPrompt({
  visible,
  type,
  brochureId,
  brochureTitle,
  onUpdateNow,
  onKeepLocal,
  onUpdateLater,
  onDownloadNow,
  onDownloadLater,
  onDismiss,
  differences,
  localBrochure,
  serverBrochure
}: BrochureSyncPromptProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Calculate differences if not provided
  let calculatedDifferences: BrochureDifferenceSummary | null = null;
  if (type === 'update' && localBrochure && serverBrochure && !differences) {
    calculatedDifferences = BrochureComparisonService.compareBrochures(localBrochure, serverBrochure);
  }

  const displayDifferences = differences || calculatedDifferences;

  const renderMessage = () => {
    switch (type) {
      case 'update':
        return `A newer version of "${brochureTitle}" is available. Would you like to update now?`;
      case 'new':
        return `New brochure "${brochureTitle}" is available. Download now?`;
      case 'download':
        return `Brochure "${brochureTitle}" needs to be downloaded. Download now?`;
      default:
        return '';
    }
  };

  const renderDetails = () => {
    if (!displayDifferences || !displayDifferences.hasChanges) {
      return null;
    }

    const diffLines = BrochureComparisonService.formatDifferencesForDisplay(displayDifferences.differences);

    return (
      <View style={styles.detailsContainer}>
        <TouchableOpacity
          style={styles.detailsHeader}
          onPress={() => setShowDetails(!showDetails)}
        >
          <Text style={styles.detailsHeaderText}>Changes:</Text>
          <Ionicons
            name={showDetails ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#8b5cf6"
          />
        </TouchableOpacity>

        {showDetails && (
          <ScrollView style={styles.detailsContent}>
            {diffLines.map((line, index) => (
              <Text key={index} style={styles.detailsLine}>
                {line}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderButtons = () => {
    switch (type) {
      case 'update':
        return (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.updateButton]}
              onPress={onUpdateNow || onDismiss}
            >
              <Ionicons name="sync" size={20} color="#ffffff" />
              <Text style={styles.buttonText}>Update Now</Text>
            </TouchableOpacity>

            {onKeepLocal && (
              <TouchableOpacity
                style={[styles.button, styles.keepButton]}
                onPress={onKeepLocal}
              >
                <Ionicons name="close" size={20} color="#ffffff" />
                <Text style={styles.buttonText}>Keep Local</Text>
              </TouchableOpacity>
            )}

            {onUpdateLater && (
              <TouchableOpacity
                style={[styles.button, styles.laterButton]}
                onPress={onUpdateLater}
              >
                <Ionicons name="time-outline" size={20} color="#8b5cf6" />
                <Text style={[styles.buttonText, styles.laterButtonText]}>Update Later</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case 'new':
      case 'download':
        return (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.downloadButton]}
              onPress={onDownloadNow || onDismiss}
            >
              <Ionicons name="download" size={20} color="#ffffff" />
              <Text style={styles.buttonText}>Download Now</Text>
            </TouchableOpacity>

            {onDownloadLater && (
              <TouchableOpacity
                style={[styles.button, styles.laterButton]}
                onPress={onDownloadLater}
              >
                <Ionicons name="time-outline" size={20} color="#8b5cf6" />
                <Text style={[styles.buttonText, styles.laterButtonText]}>Download Later</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={type === 'update' ? 'sync' : 'document-text'}
                size={32}
                color={type === 'update' ? '#f59e0b' : '#8b5cf6'}
              />
            </View>
            <Text style={styles.title}>
              {type === 'update' ? 'Brochure Update Available' : 'New Brochure Available'}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onDismiss}
            >
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <Text style={styles.message}>{renderMessage()}</Text>

            {type === 'update' && renderDetails()}
          </ScrollView>

          {renderButtons()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: isTablet() ? 700 : 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  closeButton: {
    padding: 4
  },
  content: {
    padding: 20,
    maxHeight: 300
  },
  message: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 24,
    marginBottom: 16
  },
  detailsContainer: {
    marginTop: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  detailsHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6'
  },
  detailsContent: {
    padding: 12,
    maxHeight: 200
  },
  detailsLine: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 4
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8
  },
  updateButton: {
    backgroundColor: '#f59e0b'
  },
  downloadButton: {
    backgroundColor: '#8b5cf6'
  },
  keepButton: {
    backgroundColor: '#ef4444'
  },
  laterButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff'
  },
  laterButtonText: {
    color: '#8b5cf6'
  }
});

