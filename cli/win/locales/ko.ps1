# locales/ko.ps1 - 한국어 메시지. {0}, {1}은 인자입니다.
$Messages = @{
    usage_header            = '사용법: ccg <command> [args]'
    unknown_command         = '알 수 없는 명령: {0}'
    cmd_not_yet             = "'ccg {0}'은(는) 아직 윈도우 PowerShell 버전에서 지원하지 않습니다."
    help_body               = @(
        '  ccg                  실행(기본). 포트 확인, 버전 비교, 백엔드 실행, 브라우저 열기.',
        '  ccg run              기본 동작과 같습니다.',
        '  ccg list, ls         백엔드 프로세스 트리를 보여 줍니다 (PID, 포트).',
        '  ccg update           런타임을 최신 릴리즈로 강제 업데이트합니다.',
        '  ccg stop             포트 19836의 백엔드를 자손까지 함께 종료합니다.',
        '  ccg version, -v      설치된 ccg, 캐시된 런타임, 실행 중인 백엔드를 보여 줍니다.',
        '  ccg doctor           환경을 진단합니다 (node, PATH, 캐시, 포트).',
        '  ccg self-update      설치 스크립트를 다시 실행해 ccg 자체를 업데이트합니다.',
        '  ccg uninstall        이 컴퓨터에서 ccg를 제거합니다.',
        '  ccg help, -h, --help 이 도움말을 보여 줍니다.',
        '',
        "  각 명령의 자세한 설명은 'ccg <command> -h'로 볼 수 있습니다."
    ) -join "`n"
    help_version_header     = 'ccg version - ccg, 런타임, 백엔드 버전을 보여 줍니다'
    help_version_body       = "  ccg version             설치된 ccg, 캐시된 런타임, 실행 중인 백엔드의`n                          버전을 보여 줍니다. 별칭: -v.`n  ccg version -h, --help  이 도움말을 보여 줍니다."
    help_doctor_header      = 'ccg doctor - 환경을 진단합니다'
    help_doctor_body        = "  ccg doctor             node, PATH, 캐시, 포트 19836, 살아 있는`n                         백엔드 프로세스 수를 확인합니다.`n  ccg doctor -h, --help  이 도움말을 보여 줍니다."
    version_ccg             = 'ccg 버전: {0}'
    version_runtime_cached  = '캐시된 런타임: {0}'
    version_runtime_none    = '캐시된 런타임: (없음)'
    version_backend_running = '실행 중인 백엔드: v{0} (포트 {1})'
    version_backend_none    = '실행 중인 백엔드: (없음)'
    doctor_header           = 'ccg doctor - 환경 진단'
    doctor_node_ok          = '✔ node: {0} ({1})'
    doctor_node_old         = '✘ node: {0} ({1}) 버전이 낮습니다. Node.js 18 이상이 필요합니다'
    doctor_node_missing     = '✘ node: 찾을 수 없습니다. https://nodejs.org/ 에서 Node.js 18 이상을 설치하세요 (또는: winget install OpenJS.NodeJS.LTS)'
    doctor_path_ok          = '✔ {0}이(가) PATH에 있습니다'
    doctor_path_missing     = '✘ {0}이(가) PATH에 없습니다'
    doctor_cache_count      = 'ℹ 캐시된 런타임: {0}개'
    doctor_port_free        = '✔ 포트 {0}은(는) 비어 있습니다'
    doctor_port_us          = 'ℹ 포트 {0}: 우리 백엔드 (v{1})'
    doctor_port_foreign     = '✘ 포트 {0}: 다른 프로세스가 사용 중'
    doctor_backend_count    = "ℹ backend.mjs 프로세스 {0}개 감지 - 'ccg list'로 트리를 확인하세요"
    doctor_backend_warn     = "⚠ backend.mjs 프로세스 {0}개 감지 - 'ccg list'로 확인하세요"
    running_already         = "이미 v{0}가 {1} 포트에서 실행 중입니다. 브라우저를 엽니다..."
    backend_starting        = "백엔드 v{0}를 시작합니다..."
    backend_started         = "백엔드가 {0} 포트에서 준비됐습니다."
    opening_browser         = "{0} 를 엽니다..."
    update_prompt           = "새 버전이 있습니다: v{0} (현재 v{1})."
    update_prompt_question  = "지금 업데이트할까요? (y/N): "
    update_declined         = "기존 v{0}를 유지합니다. 브라우저를 엽니다..."
    update_killed_old       = "기존 백엔드를 종료했습니다. v{0}를 설치합니다..."
    caution_marketplace     = "⚠  이 명령은 터미널 실행용 런타임만 갱신합니다.`n    JetBrains IDE 플러그인 자체는 마켓플레이스를 통해 별도로 업데이트해야 합니다.`n    (Settings → Plugins → Updates)"
    err_port_missing_value  = "오류: -p/--port 에는 포트 번호가 필요합니다 (예: ccg run -p 20000)."
    err_port_invalid        = "오류: -p/--port 는 1-65535 범위의 숫자여야 합니다."
    err_bind_missing_value  = "오류: -b/--bind 에는 주소가 필요합니다 (예: ccg run -b 0.0.0.0)."
    warn_bind_exposed       = "경고: {0} 로 바인딩합니다 - 백엔드(인증 없이 'claude' 실행 + 파일 I/O)가`n      같은 네트워크의 다른 기기에서 접근 가능해집니다. 신뢰할 수 있는 네트워크에서만 사용하세요.`n      이미 127.0.0.1에서 백엔드가 실행 중이면 'ccg stop' 후 다시 실행해야 새 바인딩이 적용됩니다."
    err_port_foreign        = "{0} 포트가 다른 프로세스에 점유되어 있습니다 (claude-code-gui가 아님)."
    err_port_foreign_hint   = "해당 프로세스를 종료한 뒤 다시 시도하세요. (힌트: netstat -ano | findstr :{0})"
    err_node_missing        = "Node.js가 설치되어 있지 않거나 PATH에 없습니다."
    err_node_missing_hint   = "https://nodejs.org/ 에서 Node.js 18 이상을 설치(또는: winget install OpenJS.NodeJS.LTS)한 뒤 다시 실행하세요."
    err_no_release          = "GitHub에서 최신 릴리즈를 가져오지 못했습니다."
    err_runtime_missing     = "v{0} 런타임이 캐시에 없고 다운로드에도 실패했습니다."
    backend_restarting      = "백엔드가 재시작 신호로 종료됐습니다. 재시작합니다..."
    err_restart_loop        = "백엔드가 너무 빨리 재시작됐습니다 (크래시 루프 감지). 중단합니다."
    help_run_header         = "ccg run - 백엔드를 시작(또는 재사용)하고 브라우저를 엽니다"
    help_run_body           = "  ccg run              19836 포트를 확인하고 백엔드를 실행(이미 실행 중이면 재사용)한 뒤`n                       브라우저에서 WebView를 엽니다. 기본 명령이라 'ccg'만 입력해도`n                       동일하게 동작합니다.`n  ccg run -b, --bind <주소>`n                       백엔드를 loopback(127.0.0.1) 대신 <주소>로 바인딩합니다.`n                       0.0.0.0을 지정하면 같은 네트워크의 다른 기기가`n                       http://<이 머신의 IP>:19836 으로 WebView에 접속할 수 있습니다.`n                       경고: 백엔드는 인증 없이 'claude' 실행과 파일 I/O를 수행하므로`n                       신뢰할 수 있는 네트워크에서만 노출하세요.`n  ccg run -p, --port <번호>`n                       백엔드를 19836 대신 <번호> 포트로 바인딩합니다. 실행 전체에`n                       적용됩니다(점유 확인, 재사용, 종료, 브라우저 URL).`n  ccg run -h, --help   이 도움말을 표시합니다."
    list_header             = "claude-code-gui 백엔드 프로세스:"
    list_none               = "현재 실행 중인 claude-code-gui 백엔드 프로세스가 없습니다."
    list_root_with_port     = "● PID {0}  포트 {1}{2}  [{3}/{4}]"
    list_root_no_port       = "● PID {0}  [{1}/{2}]"
    list_port_confirmed     = " ✔"
    list_port_unconfirmed   = " ?"
    list_child              = "    └─ PID {0}  {1}"
    list_help_hint          = "포트 {0}의 백엔드 트리를 종료하려면 'ccg stop'을 사용하세요."
    help_list_header        = "ccg list - 백엔드 프로세스 트리 표시"
    help_list_body          = "  ccg list             백엔드와 그 자손 프로세스를 PID, (있으면)포트,`n                       출처 라벨(ide/standalone)과 함께 나열합니다.`n  ccg list -h, --help  이 도움말을 표시합니다."
    stop_none               = "포트 {0}에서 실행 중인 백엔드가 없습니다."
    stop_target             = "PID {0}를 루트로 하는 백엔드 트리를 종료합니다..."
    stop_done               = "백엔드 트리가 종료됐습니다."
    stop_all_prompt         = "IDE가 띄운 것을 포함해 모든 backend.mjs 트리({0}개)를 종료합니다. 계속할까요? (y/N): "
    stop_all_none           = "종료할 backend.mjs 트리를 찾지 못했습니다."
    stop_not_ours           = "⚠  PID {0}는 claude-code-gui 백엔드 트리에 속하지 않습니다."
    stop_not_ours_prompt    = "그래도 (자식까지 함께) 종료할까요? (y/N): "
    stop_aborted            = "중단됐습니다. 아무것도 종료하지 않았습니다."
    help_stop_header        = "ccg stop - 백엔드 프로세스 트리 종료"
    help_stop_body          = "  ccg stop                 포트 19836의 백엔드를 자손까지 함께 종료합니다.`n  ccg stop <pid>           이 PID를 루트로 트리를 종료합니다.`n  ccg stop --port <port>   이 포트의 백엔드를 종료합니다 (별칭: -p).`n  ccg stop --all           IDE 것을 포함한 모든 backend.mjs 트리를 종료합니다 (확인 후; 별칭: -a).`n  ccg stop --no-tree       자식을 제외하고 지정 프로세스 하나만 종료합니다.`n  ccg stop -h, --help      이 도움말을 표시합니다.`n`n  자손을 먼저, 그다음 루트를 종료합니다. 윈도우에는 콘솔 없는 node에 보낼 정상 종료`n  신호가 없어서 프로세스를 바로 끝냅니다. -f/--force도 받지만 같은 동작입니다.`n  백엔드 트리에 속하지 않은 PID는 종료 전에 확인 프롬프트가 뜹니다."
}
