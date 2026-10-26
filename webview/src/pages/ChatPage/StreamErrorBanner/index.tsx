import { useChatStreamContext } from '../../../contexts/ChatStreamContext';
import {isSessionConflict, SessionConflictErrorBanner} from "./SessionConflictErrorBanner.tsx";
import {DefaultErrorBanner} from "./DefaultErrorBanner.tsx";
import {AuthDiagnosisBanner} from "./AuthDiagnosisBanner.tsx";
import {WorkingDirMissingError} from "@/hooks/WorkingDirMissingError";

export const StreamErrorBanner = () => {
  const { error, authDiagnosis } = useChatStreamContext();

  if (!error) return null;

  if (isSessionConflict(error)) return <SessionConflictErrorBanner />;

  // A folder that is gone is said by the bar that takes the chat input's place, not here.
  if (error instanceof WorkingDirMissingError) return null;

  // Fallback: 정의되지 않은 에러
  return (
    <>
      <DefaultErrorBanner error={error} />
      {authDiagnosis && <AuthDiagnosisBanner envApiKeys={authDiagnosis.envApiKeys} />}
    </>
  );
};
