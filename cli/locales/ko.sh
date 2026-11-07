#!/usr/bin/env bash
# Korean messages.
# Variable-prefix pattern for bash 3.2 compatibility: MSG_ko_<key>
# shellcheck disable=SC2034

MSG_ko_caution_marketplace="⚠  이 명령은 터미널 실행용 런타임만 갱신합니다.\n    JetBrains IDE 플러그인 자체는 마켓플레이스를 통해 별도로 업데이트해야 합니다.\n    (Settings → Plugins → Updates)"

# Status / info
MSG_ko_running_already="이미 v%s가 19836 포트에서 실행 중입니다. 브라우저를 엽니다..."
MSG_ko_running_already_no_browser="이미 v%s가 19836 포트에서 실행 중입니다."
MSG_ko_backend_starting="백엔드 v%s를 시작합니다..."
MSG_ko_backend_started="백엔드가 %s 포트에서 준비됐습니다."
MSG_ko_backend_stopping="백엔드를 종료합니다 (PID %s)..."
MSG_ko_backend_stopped="백엔드가 종료됐습니다."
MSG_ko_opening_browser="%s 를 엽니다..."

# Update prompts
MSG_ko_update_prompt="새 버전이 있습니다: v%s (현재 v%s)."
MSG_ko_update_prompt_question="지금 업데이트할까요? (y/N): "
MSG_ko_update_declined="기존 v%s를 유지합니다. 브라우저를 엽니다..."
MSG_ko_update_killed_old="기존 백엔드를 종료했습니다. v%s를 설치합니다..."

# Port (-p/--port)
MSG_ko_err_port_missing_value="오류: -p/--port 에는 포트 번호가 필요합니다 (예: ccg run -p 20000)."
MSG_ko_err_port_invalid="오류: -p/--port 는 1-65535 범위의 숫자여야 합니다."

# Bind (-b/--bind)
MSG_ko_err_bind_missing_value="오류: -b/--bind 에는 주소가 필요합니다 (예: ccg run -b 0.0.0.0)."
MSG_ko_warn_bind_exposed="경고: %s 로 바인딩합니다 — 백엔드(인증 없이 'claude' 실행 + 파일 I/O)가\n      같은 네트워크의 다른 기기에서 접근 가능해집니다. 신뢰할 수 있는 네트워크에서만 사용하세요.\n      이미 127.0.0.1에서 백엔드가 실행 중이면 'ccg stop' 후 다시 실행해야 새 바인딩이 적용됩니다."

# Errors
MSG_ko_err_port_foreign="19836 포트가 다른 프로세스에 점유되어 있습니다 (claude-code-gui가 아님)."
MSG_ko_err_port_foreign_hint="해당 프로세스를 종료한 뒤 다시 시도하세요. (힌트: lsof -i :19836)"
MSG_ko_err_node_missing="Node.js가 설치되어 있지 않거나 PATH에 없습니다."
MSG_ko_err_node_missing_hint="https://nodejs.org/ 에서 Node.js 18 이상을 설치한 뒤 다시 실행하세요."
MSG_ko_err_download_failed="%s 다운로드에 실패했습니다."
MSG_ko_err_no_release="GitHub에서 최신 릴리즈를 가져오지 못했습니다."
MSG_ko_err_runtime_missing="v%s 런타임이 캐시에 없고 다운로드에도 실패했습니다."
MSG_ko_err_port_handshake_timeout="백엔드가 %s초 안에 PORT를 출력하지 않았습니다."

# Doctor
MSG_ko_doctor_header="ccg doctor — 환경 진단"
MSG_ko_doctor_node_ok="✔ node: %s"
MSG_ko_doctor_node_missing="✘ node: 찾을 수 없음"
MSG_ko_doctor_path_ok="✔ ~/.claude-code-gui/bin 이 PATH에 있음"
MSG_ko_doctor_path_missing="✘ ~/.claude-code-gui/bin 이 PATH에 없음"
MSG_ko_doctor_cache_count="ℹ 캐시된 런타임: %s개"
MSG_ko_doctor_port_free="✔ 19836 포트가 비어있음"
MSG_ko_doctor_port_us="ℹ 19836 포트: 우리 백엔드 (v%s)"
MSG_ko_doctor_port_foreign="✘ 19836 포트: 다른 프로세스 점유"

# Version
MSG_ko_version_ccg="ccg 버전: %s"
MSG_ko_version_runtime_cached="캐시된 런타임: %s"
MSG_ko_version_runtime_none="캐시된 런타임: (없음)"
MSG_ko_version_backend_running="실행 중인 백엔드: v%s (19836 포트)"
MSG_ko_version_backend_none="실행 중인 백엔드: (없음)"

# Install / uninstall
MSG_ko_install_welcome="claude-code-gui (ccg) v%s 설치를 시작합니다..."
MSG_ko_install_path_added="%s 를 PATH에 추가했습니다 (%s)"
MSG_ko_install_path_already="%s 에 PATH 항목이 이미 있습니다"
MSG_ko_install_done="✔ 설치 완료. 새 터미널을 열거나 다음을 실행하세요: source %s"
MSG_ko_install_done_then="그 후 실행: ccg"
MSG_ko_install_overwrite_prompt="기존 설치(v%s)가 감지됐습니다. 덮어쓸까요? (Y/n): "
MSG_ko_uninstall_removing="%s 를 제거합니다..."
MSG_ko_uninstall_path_removed="%s 에서 PATH 항목을 제거했습니다"
MSG_ko_uninstall_done="✔ 제거 완료. 실행 중인 ccg 세션이 있다면 종료하세요."

# List (process tree)
MSG_ko_list_header="claude-code-gui 백엔드 프로세스:"
MSG_ko_list_none="현재 실행 중인 claude-code-gui 백엔드 프로세스가 없습니다."
MSG_ko_list_root_with_port="● PID %s  포트 %s%s  [%s/%s]"
MSG_ko_list_root_no_port="● PID %s  [%s/%s]"
MSG_ko_list_port_confirmed=" ✔"
MSG_ko_list_port_unconfirmed=" ?"
MSG_ko_list_child="    └─ PID %s  %s"
MSG_ko_list_zombie_hint="(좀비 — 부모를 종료해야 사라집니다)"
MSG_ko_list_help_hint="포트 19836의 백엔드 트리를 종료하려면 'ccg stop'을 사용하세요."

# Stop (process tree termination)
MSG_ko_stop_none="포트 %s에서 실행 중인 백엔드가 없습니다."
MSG_ko_stop_target="PID %s를 루트로 하는 백엔드 트리를 종료합니다..."
MSG_ko_stop_done="백엔드 트리가 종료됐습니다."
MSG_ko_stop_force="강제 모드: 정상 종료 없이 즉시 SIGKILL을 보냅니다."
MSG_ko_stop_all_prompt="IDE가 띄운 것을 포함해 모든 backend.mjs 트리(%s개)를 종료합니다. 계속할까요? (y/N): "
MSG_ko_stop_all_none="종료할 backend.mjs 트리를 찾지 못했습니다."
MSG_ko_stop_no_roots="backend.mjs 트리를 찾지 못했습니다."
MSG_ko_stop_not_ours="⚠  PID %s는 claude-code-gui 백엔드 트리에 속하지 않습니다."
MSG_ko_stop_not_ours_prompt="그래도 (자식까지 함께) 종료할까요? (y/N): "
MSG_ko_stop_aborted="중단됐습니다. 아무것도 종료하지 않았습니다."

# Doctor (backend process hint)
MSG_ko_doctor_backend_count="ℹ backend.mjs 프로세스 %s개 감지됨 — 트리를 보려면 'ccg list' 실행"
MSG_ko_doctor_backend_warn="⚠ backend.mjs 프로세스 %s개 감지됨 — 'ccg list'로 확인하세요"

# Help: list / stop
MSG_ko_help_list_header="ccg list — 백엔드 프로세스 트리 표시"
MSG_ko_help_list_body="  ccg list             백엔드와 그 자손 프로세스를 PID, (있으면)포트,\n                       출처 라벨(ide/standalone)과 함께 나열합니다.\n  ccg list -h, --help  이 도움말을 표시합니다."
MSG_ko_help_stop_header="ccg stop — 백엔드 프로세스 트리 종료"
MSG_ko_help_stop_body="  ccg stop                 포트 19836의 백엔드를 자손까지 함께 종료합니다.\n  ccg stop <pid>           이 PID를 루트로 트리를 종료합니다.\n  ccg stop --port <port>   이 포트의 백엔드를 종료합니다 (별칭: -p).\n  ccg stop --all           IDE 것을 포함한 모든 backend.mjs 트리를 종료합니다 (확인 후; 별칭: -a).\n  ccg stop --force         정상 종료(SIGTERM)를 생략하고 즉시 SIGKILL합니다 (별칭: -f).\n  ccg stop --no-tree       자식을 제외하고 지정 프로세스 하나만 종료합니다.\n  ccg stop -h, --help      이 도움말을 표시합니다.\n\n  종료 순서: 잎(자식)부터 먼저, 그다음 루트. 각 프로세스에 SIGTERM →\n  최대 3초 대기 → SIGKILL. --force면 즉시 SIGKILL. 백엔드 트리에\n  속하지 않은 PID는 종료 전에 확인 프롬프트를 띄웁니다."

# Help: run / update / version / doctor / self-update / uninstall
MSG_ko_help_run_header="ccg run — 백엔드를 시작(또는 재사용)하고 브라우저를 엽니다"
MSG_ko_help_run_body="  ccg run              19836 포트를 확인하고 백엔드를 실행(이미 실행 중이면 재사용)한 뒤\n                       브라우저에서 WebView를 엽니다. 기본 명령이라 'ccg'만 입력해도\n                       동일하게 동작합니다.\n  ccg run -b, --bind <주소>\n                       백엔드를 loopback(127.0.0.1) 대신 <주소>로 바인딩합니다.\n                       0.0.0.0을 지정하면 같은 네트워크의 다른 기기가\n                       http://<이 머신의 IP>:19836 으로 WebView에 접속할 수 있습니다.\n                       경고: 백엔드는 인증 없이 'claude' 실행과 파일 I/O를 수행하므로\n                       신뢰할 수 있는 네트워크에서만 노출하세요.\n  ccg run -p, --port <번호>\n                       백엔드를 19836 대신 <번호> 포트로 바인딩합니다. 실행 전체에\n                       적용됩니다(점유 확인, 재사용, 종료, 브라우저 URL).\n  ccg run -h, --help   이 도움말을 표시합니다."
MSG_ko_help_update_header="ccg update — 런타임을 최신 릴리즈로 강제 갱신합니다"
MSG_ko_help_update_body="  ccg update             런타임을 최신 GitHub 릴리즈로 갱신합니다. 실행 중인 백엔드가\n                         있으면 먼저 종료한 뒤 교체합니다.\n  ccg update -h, --help  이 도움말을 표시합니다."
MSG_ko_help_version_header="ccg version — ccg·런타임·백엔드 버전을 표시합니다"
MSG_ko_help_version_body="  ccg version             설치된 ccg, 캐시된 런타임, 현재 실행 중인 백엔드의 버전을\n                          표시합니다. 별칭: -v.\n  ccg version -h, --help  이 도움말을 표시합니다."
MSG_ko_help_doctor_header="ccg doctor — 환경을 진단합니다"
MSG_ko_help_doctor_body="  ccg doctor             node, PATH, 캐시, 19836 포트, 살아있는 백엔드 프로세스 수를\n                         점검합니다.\n  ccg doctor -h, --help  이 도움말을 표시합니다."
MSG_ko_help_self_update_header="ccg self-update — ccg 자체를 갱신합니다"
MSG_ko_help_self_update_body="  ccg self-update             설치 스크립트를 다시 실행해 ccg cli를 갱신합니다.\n  ccg self-update -h, --help  이 도움말을 표시합니다."
MSG_ko_help_uninstall_header="ccg uninstall — 이 머신에서 ccg를 제거합니다"
MSG_ko_help_uninstall_body="  ccg uninstall             이 머신에서 ccg를 제거합니다(바이너리, 런타임, PATH 항목).\n                            사용자 데이터(계정, 설정, 라이선스)는 남깁니다.\n  ccg uninstall -h, --help  이 도움말을 표시합니다."

# Restart loop (standalone foreground)
MSG_ko_backend_restarting="백엔드가 재시작 신호로 종료됐습니다. 재시작합니다..."
MSG_ko_err_restart_loop="백엔드가 너무 빨리 재시작됐습니다 (크래시 루프 감지). 중단합니다."

# Generic
MSG_ko_abort="중단됐습니다."
MSG_ko_unknown_command="알 수 없는 명령: %s"
MSG_ko_usage_header="사용법: ccg <command> [args]"
MSG_ko_help_browser_header="swttch browser — 백엔드를 시작(또는 재사용)하고 브라우저를 엽니다"
MSG_ko_help_browser_body="  swttch browser       19836 포트를 확인하고 백엔드를 실행(이미 실행 중이면 재사용)한 뒤\n                       브라우저에서 WebView를 엽니다.\n  swttch browser -b, --bind <주소>\n                       백엔드를 loopback(127.0.0.1) 대신 <주소>로 바인딩합니다.\n                       0.0.0.0을 지정하면 같은 네트워크의 다른 기기가\n                       http://<이 머신의 IP>:19836 으로 WebView에 접속할 수 있습니다.\n                       경고: 백엔드는 인증 없이 'claude' 실행과 파일 I/O를 수행하므로\n                       신뢰할 수 있는 네트워크에서만 노출하세요.\n  swttch browser -p, --port <번호>\n                       백엔드를 19836 대신 <번호> 포트로 바인딩합니다. 실행 전체에\n                       적용됩니다(점유 확인, 재사용, 종료, 브라우저 URL).\n  swttch browser -h, --help\n                       이 도움말을 표시합니다."
MSG_ko_swttch_usage_header="사용법: swttch <command> [args]"
MSG_ko_desktop_not_available="Swttch 데스크탑 앱은 아직 제공되지 않습니다."
MSG_ko_help_swttch_body="  swttch browser        브라우저에서 Swttch를 엽니다 (백엔드를 시작하거나 재사용).\n                        자세한 내용은 -h. (예전 이름 'ccg'도 동작하지만 더는 권장하지 않습니다.)\n  swttch desktop        Swttch 데스크탑 앱을 엽니다 (아직 제공되지 않음).\n  swttch list, ls       백엔드 프로세스 트리를 보여 줍니다 (PID, 포트, 출처 라벨).\n  swttch account, acct  저장된 Claude 계정을 관리합니다 (list/use/current/save/rm).\n  swttch update         런타임을 최신 릴리즈로 강제 업데이트합니다.\n  swttch stop           포트 19836의 백엔드를 자손까지 함께 종료합니다.\n  swttch version, -v    설치된 swttch, 캐시된 런타임, 실행 중인 백엔드를 보여 줍니다.\n  swttch doctor         환경을 진단합니다 (node, PATH, 캐시, 포트).\n  swttch self-update    설치 스크립트를 다시 실행해 swttch 자체를 업데이트합니다.\n  swttch uninstall      이 컴퓨터에서 swttch를 제거합니다.\n  swttch help, -h       이 도움말을 보여 줍니다.\n\n  각 명령의 자세한 설명은 'swttch <command> -h'로 볼 수 있습니다."

# Account (ccg account)
MSG_ko_account_list_header="저장된 Claude 계정:"
MSG_ko_account_active_marker="*"
MSG_ko_account_none="저장된 계정이 없습니다. 'claude'로 로그인한 뒤 'ccg account save'를 실행하세요."
MSG_ko_account_current="현재 계정: %s"
MSG_ko_account_switched="%s 계정으로 전환했습니다."
MSG_ko_account_saved="%s 계정을 저장했습니다."
MSG_ko_account_removed="%s 계정을 삭제했습니다."
MSG_ko_account_rm_prompt="저장된 계정 %s 을(를) 삭제할까요? (y/N): "
MSG_ko_account_keychain_note="참고: macOS는 키체인 읽기를 약 30초 캐시합니다 — 방금 시작한 'claude'가 이전 계정을 쓸 수 있습니다. 이미 실행 중인 세션은 재시작 전까지 기존 자격증명을 유지합니다."
MSG_ko_err_account_need_token="계정을 지정하세요 (id, 이메일, 이름 또는 고유한 일부 문자열)."
MSG_ko_err_account_unknown_sub="알 수 없는 account 하위 명령: %s"
MSG_ko_err_account_helper_missing="런타임에서 account 헬퍼를 찾을 수 없습니다. 'ccg update'로 갱신하세요."
MSG_ko_err_account_not_found="'%s' 와(과) 일치하는 저장된 계정이 없습니다."
MSG_ko_err_account_ambiguous="'%s' 가 여러 계정과 일치합니다:"
MSG_ko_err_account_no_login="저장할 로그인된 Claude 계정이 없습니다. 먼저 'claude'로 로그인하세요."
MSG_ko_err_account_generic="account 명령이 실패했습니다."
MSG_ko_help_account_header="ccg account — 저장된 Claude 계정 관리"
MSG_ko_help_account_body="  ccg account [list]        저장된 계정 목록 (현재 계정은 * 표시).\n  ccg account current       현재 활성 계정 표시.\n  ccg account use <who>     활성 계정 전환 (who = id, 이메일, 이름 또는 일부 문자열).\n  ccg account save          현재 로그인된 계정을 빠른 전환용으로 저장.\n  ccg account rm <who>      저장된 계정 삭제 (확인 후).\n  ccg account -h, --help    이 도움말 표시.\n\n  전환은 시스템 전역 활성 자격증명을 교체하므로, 새로 실행되는 'claude'(터미널/GUI)가\n  선택한 계정을 사용합니다."
