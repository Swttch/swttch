import { useForm, useFieldArray } from 'react-hook-form';

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionItem {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface QuestionField {
  selected: string[];
  otherText: string;
}

interface FormValues {
  questions: QuestionField[];
  currentIndex: number;
}

/** `preselectFirst`: in the views that follow the desktop app a question with one answer opens with its first option picked. */
export function useFormState(questions: QuestionItem[], preselectFirst = false) {
  const { control, watch, setValue, getValues } = useForm<FormValues>({
    defaultValues: {
      questions: questions.map((question) => ({
        selected: preselectFirst && !question.multiSelect && question.options?.[0] ? [question.options[0].label] : [],
        otherText: '',
      })),
      currentIndex: 0,
    },
  });

  // useFieldArray로 questions 배열 관리
  useFieldArray({ control, name: 'questions' });

  // watch() 전체 호출: 모든 필드 변경 시 re-render 보장
  const formValues = watch();
  const currentIndex = formValues.currentIndex;
  const questionFields = formValues.questions;

  const currentField = questionFields[currentIndex];
  const currentQuestion = questions[currentIndex];

  const isLastTab = currentIndex === questions.length - 1;

  const allOptionsFor = (qIdx: number): QuestionOption[] => [
    ...questions[qIdx].options,
    { label: 'Other', description: '' },
  ];

  const isOtherSelected = (qIdx: number): boolean =>
    questionFields[qIdx]?.selected.includes('Other') ?? false;

  const canSubmitCurrent = (() => {
    if (!currentField || currentField.selected.length === 0) return false;
    if (currentField.selected.includes('Other')) {
      return currentField.otherText.trim().length > 0;
    }
    return true;
  })();

  // 최종 탭이거나 multiSelect인 경우 Submit 버튼 표시
  const showSubmitButton = isLastTab || currentQuestion?.multiSelect;

  function selectOption(qIdx: number, label: string, multiSelect: boolean) {
    const field = getValues(`questions.${qIdx}`);

    if (label === 'Other') {
      if (multiSelect) {
        const has = field.selected.includes('Other');
        setValue(
          `questions.${qIdx}.selected`,
          has ? field.selected.filter(l => l !== 'Other') : [...field.selected, 'Other'],
        );
      } else {
        setValue(`questions.${qIdx}.selected`, ['Other']);
      }
      return;
    }

    if (multiSelect) {
      const has = field.selected.includes(label);
      setValue(
        `questions.${qIdx}.selected`,
        has ? field.selected.filter(l => l !== label) : [...field.selected, label],
      );
    } else {
      setValue(`questions.${qIdx}.selected`, [label]);

      // 비최종 탭 + single-select: 자동으로 다음 탭 이동
      if (!isLastTab) {
        setValue('currentIndex', qIdx + 1);
      }
    }
  }

  function setOtherText(qIdx: number, text: string) {
    setValue(`questions.${qIdx}.otherText`, text);
  }

  function setCurrentIndex(idx: number) {
    setValue('currentIndex', idx);
  }

  function resolveAnswer(qIdx: number): string {
    const field = getValues(`questions.${qIdx}`);
    const parts = field.selected.flatMap(label => {
      if (label === 'Other') {
        const text = field.otherText.trim();
        return text ? [text] : [];
      }
      return [label];
    });
    return parts.join(', ');
  }

  /** 현재 탭의 Submit/다음 버튼 핸들러 */
  function submitCurrent(): string | null {
    if (!canSubmitCurrent) return null;

    if (!isLastTab) {
      setValue('currentIndex', currentIndex + 1);
      return null;
    }

    // 최종 탭: 모든 질문의 답변을 조합해서 반환
    const allAnswers = questions.map((_, idx) => resolveAnswer(idx));
    return allAnswers.join('\n');
  }

  function buildAnswersRecord(): Record<string, string> {
    const record: Record<string, string> = {};
    questions.forEach((q, idx) => {
      record[q.question] = resolveAnswer(idx);
    });
    return record;
  }

  return {
    currentIndex,
    currentField,
    currentQuestion,
    isLastTab,
    showSubmitButton,
    canSubmitCurrent,
    allOptionsFor,
    isOtherSelected,
    selectOption,
    setOtherText,
    setCurrentIndex,
    submitCurrent,
    buildAnswersRecord,
    questions: questionFields,
  };
}
