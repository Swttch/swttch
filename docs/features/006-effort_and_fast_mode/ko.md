# Effort & Fast Mode

> 언어: [English](./en.md) · **한국어**
>
> 관련: [#121](https://github.com/Swttch/swttch/issues/121), [#152](https://github.com/Swttch/swttch/issues/152)

**Model** 섹션의 두 컨트롤 **Effort**와 **Fast mode**는 모델별로 속도와 깊이를 조절하게 해줍니다. 둘 다 Claude Code CLI에서 이미 설정할 수 있는 것을, 채팅을 벗어나지 않고 바로 조작할 수 있도록 인라인 컨트롤로 꺼내온 것입니다.

## Effort

**Effort**는 Claude가 응답에 얼마나 공을 들이는지 — 추론에 쓰는 예산 — 를 뜻합니다. 높을수록 더 깊이 생각하고(느리고 토큰을 더 씀), 낮을수록 더 빠르고 저렴하게 답합니다. CLI가 모델별로 노출하는 바로 그 설정입니다.

### 슬라이더

Effort는 목록이 아니라 **슬라이더**입니다. 각 눈금은 현재 모델이 지원하는 단계 하나입니다:

| 단계 | 표시 |
|------|------|
| `low` | Low |
| `medium` | Medium |
| `high` | High |
| `xhigh` | Extra high |
| `max` | Max |

- **Auto**는 눈금이 아닙니다. 아직 단계를 고르지 않았을 때 표시되는 라벨로, "CLI 기본값을 사용"한다는 뜻입니다. 단계를 하나라도 고르면 슬라이더는 실제 단계 안에서만 움직입니다.
- 슬라이더를 **클릭하거나 드래그**하면 해당 단계로 이동합니다. **행을 클릭**(또는 Enter)하면 다음 단계로 순환하며, 마지막에서 첫 단계로 돌아옵니다.

### Ultracode (최상단 스텝)

모델이 `xhigh` 단계를 지원하면, 슬라이더에 Max를 지나 한 칸이 더 생기고 **보라색**으로 표시됩니다 — **Ultracode**입니다. 여기에 놓으면 `xhigh` effort에 더해 상시 워크플로우 오케스트레이션까지 켜지는, 최대 성능 설정이 됩니다. 모델이 `xhigh`를 지원하고 Workflows가 비활성이 아닐 때만 제공됩니다.

### 어디서 찾나요

- **슬래시 커맨드 패널**(`/` 입력) → **Model** 섹션 → **Effort** 행. 라벨 옆에 현재 단계가 표시됩니다(예: *Effort (Extra high)*).
- **모드 팝업**(**Shift + Tab**) → 하단에 effort 슬라이더가 있습니다.

## Fast mode

**Fast mode**는 더 빠른 출력을 우선합니다. **Opus** 모델에서만 사용할 수 있으며, **Model** 섹션의 **Toggle fast mode** 스위치에서 켤 수 있습니다.

## 모델별 지원 한눈에 보기

어떤 컨트롤이 적용되는지는 사용 중인 모델에 따라 다릅니다. CLI가 각 모델의 지원 여부를 알려주고, GUI는 그것을 그대로 따릅니다:

| 모델 | Effort | 단계 | Ultracode | Fast mode |
|------|:---:|---|:---:|:---:|
| **Opus** | ✅ | Low · Medium · High · Extra high · Max | ✅ | ✅ |
| **Sonnet** | ✅ | Low · Medium · High · Max *(Extra high 없음)* | ❌ | ❌ |
| **Haiku** | ❌ | — | ❌ | ❌ |

알아두면 좋은 점 두 가지:

- **Sonnet에는 Extra high가 없어서** **Ultracode 스텝도 없습니다** — 버그가 아니라 모델의 지원 범위입니다.
- **Fast mode는 Opus 전용**이라, Sonnet과 Haiku에서는 토글이 비활성입니다.

## 지원하지 않는 모델에서의 동작

지원하지 않는 모델에서 컨트롤을 아예 숨기는 대신, 행은 그대로 보이되 **비활성(회색)** 으로 표시되고, 마우스를 올리면 이유를 짧은 툴팁으로 알려줍니다 — 예를 들어 *"This model doesn't support effort levels"* 또는 *"Fast mode is only available on Opus models"*. 이렇게 하면 어떤 모델에서든 Model 섹션이 일관되게 보여서, 컨트롤이 없어졌다고 고장으로 오해하지 않게 됩니다 ([#152](https://github.com/Swttch/swttch/issues/152)).

## 참고

- 이 컨트롤들은 **현재 실행 중인 세션 모델**을 반영합니다 — 모델을 바꾸면 사용 가능한 effort 단계, Ultracode 스텝, Fast mode 지원 여부가 그에 맞춰 갱신됩니다.
- 여기 있는 모든 것은 CLI가 이미 지원하는 것과 대응됩니다. GUI는 그저 플래그 대신 클릭으로 바꿔줄 뿐입니다.
