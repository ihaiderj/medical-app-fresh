/**
 * Global Form Context
 * Manages reusable forms across the entire application
 */
import React, { createContext, useContext, useState, ReactNode } from 'react';
import DoctorFormModal from '../components/DoctorFormModal';
import MeetingFormModal from '../components/MeetingFormModal';

interface GlobalFormContextType {
  // Doctor Form Management
  showDoctorForm: (existingDoctor?: any, onSuccess?: (doctor?: any) => void) => void;
  hideDoctorForm: () => void;
  
  // Meeting Form Management
  showMeetingForm: (existingMeeting?: any, selectedDoctor?: any, onSuccess?: (meeting?: any) => void) => void;
  hideMeetingForm: () => void;
  
  // Form States
  isDoctorFormVisible: boolean;
  isMeetingFormVisible: boolean;
}

const GlobalFormContext = createContext<GlobalFormContextType | undefined>(undefined);

interface GlobalFormProviderProps {
  children: ReactNode;
}

export function GlobalFormProvider({ children }: GlobalFormProviderProps) {
  // Doctor Form State
  const [isDoctorFormVisible, setIsDoctorFormVisible] = useState(false);
  const [doctorFormData, setDoctorFormData] = useState<any>(null);
  const [doctorFormOnSuccess, setDoctorFormOnSuccess] = useState<((doctor?: any) => void) | undefined>();

  // Meeting Form State
  const [isMeetingFormVisible, setIsMeetingFormVisible] = useState(false);
  const [meetingFormData, setMeetingFormData] = useState<any>(null);
  const [meetingFormSelectedDoctor, setMeetingFormSelectedDoctor] = useState<any>(null);
  const [meetingFormOnSuccess, setMeetingFormOnSuccess] = useState<((meeting?: any) => void) | undefined>();

  // Doctor Form Management
  const showDoctorForm = (existingDoctor?: any, onSuccess?: (doctor?: any) => void) => {
    setDoctorFormData(existingDoctor || null);
    setDoctorFormOnSuccess(() => {
      if (!onSuccess) {
        return undefined;
      }

      return (doctor?: any) => {
        onSuccess(doctor);
      };
    });
    setIsDoctorFormVisible(true);
  };

  const hideDoctorForm = () => {
    setIsDoctorFormVisible(false);
    setDoctorFormData(null);
    setDoctorFormOnSuccess(undefined);
  };

  const handleDoctorFormSuccess = (doctor?: any) => {
    if (doctorFormOnSuccess) {
      doctorFormOnSuccess(doctor);
    }
    hideDoctorForm();
  };

  // Meeting Form Management
  const showMeetingForm = (existingMeeting?: any, selectedDoctor?: any, onSuccess?: (meeting?: any) => void) => {
    setMeetingFormData(existingMeeting || null);
    setMeetingFormSelectedDoctor(selectedDoctor || null);
    setMeetingFormOnSuccess(() => {
      if (!onSuccess) {
        return undefined;
      }
      return (meeting?: any) => {
        onSuccess(meeting);
      };
    });
    setIsMeetingFormVisible(true);
  };

  const hideMeetingForm = () => {
    setIsMeetingFormVisible(false);
    setMeetingFormData(null);
    setMeetingFormSelectedDoctor(null);
    setMeetingFormOnSuccess(undefined);
  };

  const handleMeetingFormSuccess = (meeting?: any) => {
    if (meetingFormOnSuccess) {
      meetingFormOnSuccess(meeting);
    }
    hideMeetingForm();
  };

  const value: GlobalFormContextType = {
    showDoctorForm,
    hideDoctorForm,
    showMeetingForm,
    hideMeetingForm,
    isDoctorFormVisible,
    isMeetingFormVisible,
  };

  return (
    <GlobalFormContext.Provider value={value}>
      {children}
      
      {/* Global Doctor Form Modal */}
      <DoctorFormModal
        visible={isDoctorFormVisible}
        onClose={hideDoctorForm}
        onSuccess={handleDoctorFormSuccess}
        existingDoctor={doctorFormData}
        title={doctorFormData ? "Edit Doctor" : "Add New Doctor"}
      />
      
      {/* Global Meeting Form Modal */}
      <MeetingFormModal
        visible={isMeetingFormVisible}
        onClose={hideMeetingForm}
        onSuccess={handleMeetingFormSuccess}
        existingMeeting={meetingFormData}
        selectedDoctor={meetingFormSelectedDoctor}
        title={meetingFormData ? "Edit Meeting" : "Schedule New Meeting"}
        onAddDoctor={showDoctorForm}
      />
    </GlobalFormContext.Provider>
  );
}

export function useGlobalForms() {
  const context = useContext(GlobalFormContext);
  if (context === undefined) {
    throw new Error('useGlobalForms must be used within a GlobalFormProvider');
  }
  return context;
}
