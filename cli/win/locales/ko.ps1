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
}
