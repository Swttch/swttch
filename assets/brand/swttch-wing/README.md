# Swttch WING assets

2026-10-12에 정리한 평면 로고 에셋입니다. 2026-09-24 WING 컬러 시안의 첫 번째 Oxblood 심볼에서 두 잎의 윤곽을 추출했습니다. 원본 시안은 `source/wing-color-directions.png`에 보존했습니다.

## 파일 선택

| 폴더 | 용도 | 제공 형식 |
| --- | --- | --- |
| `symbol/` | 심볼 단독, 투명 배경 | SVG, 폭 1024 PNG |
| `horizontal/` | 심볼 + swttch 워드마크, 투명 배경 | SVG, 폭 1024 PNG |
| `avatar/` | 조직 아바타와 앱 아이콘의 바탕 에셋 | SVG, 256·512·1024 정사각 PNG |
| `small/` | 작은 심볼과 메뉴바용 | SVG, 폭 16·24·32·48·64 PNG |
| `source/` | 원본 시안, 윤곽선 마스터, 생성 스크립트와 글꼴 | PNG, SVG, Python, JS, TTF |

심볼·가로 조합·소형 심볼은 `oxblood`, `black`, `white` 버전이 있습니다. 아바타는 크림 바탕/버건디 심볼(`cream`), 버건디 바탕/흰 심볼(`oxblood`) 두 버전입니다. OS에서 마스킹하기 좋도록 아바타 배경에는 둥근 모서리를 미리 넣지 않았습니다.

## 색상과 형태

- Oxblood: `#570B27`
- Black: `#171717`
- White: `#FFFFFF`
- Cream background: `#F5F0E6`

시안의 미세한 색상 차이를 한 가지 Oxblood 단색으로 정리했습니다. 그라디언트, 금속 질감, 그림자, 테두리를 사용하지 않습니다. 작은 심볼도 같은 윤곽을 유지합니다. 소형 PNG의 숫자는 **폭**이며 높이는 심볼 비율을 따릅니다. 정사각형 파일이 필요하면 `avatar/`를 사용합니다.

워드마크는 Manrope Light(300)에 넓은 자간을 적용했습니다. SVG에는 모든 글자가 path로 들어 있으므로 글꼴 설치가 필요하지 않습니다. 이전 시안의 글자를 그대로 추출한 것은 아니며, 이번 에셋에 맞춰 조판한 첫 버전입니다. 글꼴 원본과 SIL Open Font License는 `source/`에 포함했습니다.

## 재생성

Python의 Pillow와 fonttools, Node.js의 sharp가 필요합니다.

```bash
bash -c 'python3 assets/brand/swttch-wing/source/generate.py'
bash -c 'node assets/brand/swttch-wing/source/export-png.cjs'
```

`SWTTCH_SHARP_PATH`로 설치된 sharp 모듈의 경로를 지정할 수 있습니다.

## 확인과 적용 상태

`preview.png`에서 색상·조합·아바타·소형 크기를 비교할 수 있습니다. SVG 윤곽과 PNG 투명도를 확인한 로컬 에셋이며, GitHub 조직·웹사이트·플러그인에는 아직 적용하지 않았습니다.
