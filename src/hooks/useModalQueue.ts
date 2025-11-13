/**
 * Modal Queue Hook
 * Manages modal opening/closing with proper delays for iOS compatibility
 * Prevents simultaneous modal operations that cause iOS to hang
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';

interface ModalQueueItem {
  name: string;
  timestamp: number;
}

// iOS needs longer delays between modal transitions
const MODAL_TRANSITION_DELAY = Platform.OS === 'ios' ? 400 : 200;

export const useModalQueue = () => {
  const [activeModals, setActiveModals] = useState<string[]>([]);
  const [modalQueue, setModalQueue] = useState<ModalQueueItem[]>([]);
  const processingRef = useRef(false);
  const lastTransitionRef = useRef(Date.now());

  /**
   * Process the next item in the queue
   */
  const processQueue = useCallback(() => {
    if (processingRef.current || modalQueue.length === 0) {
      return;
    }

    const timeSinceLastTransition = Date.now() - lastTransitionRef.current;
    
    if (timeSinceLastTransition < MODAL_TRANSITION_DELAY) {
      // Wait for the delay before processing next item
      setTimeout(() => {
        processQueue();
      }, MODAL_TRANSITION_DELAY - timeSinceLastTransition);
      return;
    }

    processingRef.current = true;
    const nextItem = modalQueue[0];

    setModalQueue(prev => prev.slice(1));
    setActiveModals(prev => {
      if (prev.includes(nextItem.name)) {
        return prev;
      }
      return [...prev, nextItem.name];
    });

    lastTransitionRef.current = Date.now();
    processingRef.current = false;

    // Process next item if any
    setTimeout(() => {
      processQueue();
    }, MODAL_TRANSITION_DELAY);
  }, [modalQueue]);

  useEffect(() => {
    processQueue();
  }, [modalQueue, processQueue]);

  /**
   * Open a modal with proper queuing
   */
  const openModal = useCallback((modalName: string) => {
    // If already open or queued, ignore
    if (activeModals.includes(modalName)) {
      return;
    }

    const queuedItem = modalQueue.find(item => item.name === modalName);
    if (queuedItem) {
      return;
    }

    setModalQueue(prev => [...prev, { name: modalName, timestamp: Date.now() }]);
  }, [activeModals, modalQueue]);

  /**
   * Close a modal with proper cleanup
   */
  const closeModal = useCallback((modalName: string, onClosed?: () => void) => {
    setActiveModals(prev => {
      const filtered = prev.filter(name => name !== modalName);
      
      // If modal was actually closed, execute callback after delay
      if (prev.includes(modalName) && onClosed) {
        setTimeout(() => {
          onClosed();
        }, MODAL_TRANSITION_DELAY);
      }
      
      return filtered;
    });

    lastTransitionRef.current = Date.now();
  }, []);

  /**
   * Close current modal and open another one (safe transition)
   */
  const switchModal = useCallback((currentModal: string, nextModal: string, onSwitched?: () => void) => {
    closeModal(currentModal, () => {
      openModal(nextModal);
      if (onSwitched) {
        onSwitched();
      }
    });
  }, [closeModal, openModal]);

  /**
   * Check if a modal is currently visible
   */
  const isModalOpen = useCallback((modalName: string): boolean => {
    return activeModals.includes(modalName);
  }, [activeModals]);

  /**
   * Close all modals
   */
  const closeAllModals = useCallback(() => {
    setActiveModals([]);
    setModalQueue([]);
    lastTransitionRef.current = Date.now();
  }, []);

  /**
   * Check if it's safe to open a new modal
   */
  const canOpenModal = useCallback((): boolean => {
    const timeSinceLastTransition = Date.now() - lastTransitionRef.current;
    return timeSinceLastTransition >= MODAL_TRANSITION_DELAY && activeModals.length < 2;
  }, [activeModals]);

  return {
    openModal,
    closeModal,
    switchModal,
    isModalOpen,
    closeAllModals,
    canOpenModal,
    activeModals,
    hasActiveModals: activeModals.length > 0,
  };
};

/**
 * Higher-order function to wrap modal handlers with proper delays
 */
export const withModalDelay = (handler: () => void, delayMs?: number): (() => void) => {
  return () => {
    setTimeout(() => {
      handler();
    }, delayMs || MODAL_TRANSITION_DELAY);
  };
};

