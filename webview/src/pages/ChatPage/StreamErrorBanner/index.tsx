import { useChatStreamContext } from '../../../contexts/ChatStreamContext';
import {isSessionConflict, SessionConflictErrorBanner} from "./SessionConflictErrorBanner.tsx";
import {DefaultErrorBanner} from "./DefaultErrorBanner.tsx";
import {AuthDiagnosisBanner} from "./AuthDiagnosisBanner.tsx";
import {WorkingDirMissingErrorBanner} from "./WorkingDirMissingErrorBanner.tsx";
import {WorkingDirMissingError} from "@/hooks/WorkingDirMissingError";

export const StreamErrorBanner = () => {
  const { error, authDiagnosis } = useChatStreamContext();

  if (!error) return null;

  if (isSessionConflict(error)) return <SessionConflictErrorBanner />;

  if (error instanceof WorkingDirMissingError) return <WorkingDirMissingErrorBanner error={error} />;

  // Fallback: 정의되지 않은 에러
  return (
    <>
      <DefaultErrorBanner error={error} />
      {authDiagnosis && <AuthDiagnosisBanner envApiKeys={authDiagnosis.envApiKeys} />}
    </>
  );
};
