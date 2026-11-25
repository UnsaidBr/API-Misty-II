export type EndpointCategory =
  | 'Locomoção'
  | 'Cabeça & Braços'
  | 'LED & Visor'
  | 'Áudio & Fala'
  | 'Sensores & SLAM'
  | 'Visão Computacional'
  | 'Coreografia & Batch'
  | 'Sistema & Ponte';

export interface ApiParamDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ApiEndpointSpec {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  mistyStockPath: string | null;
  category: EndpointCategory;
  title: string;
  description: string;
  tier: 'Misty II Compatível' | 'Exclusivo v2';
  defaultBody?: Record<string, unknown>;
  params: ApiParamDoc[];
}

export const API_ENDPOINTS: ApiEndpointSpec[] = [
  {
    id: 'drive',
    method: 'POST',
    path: '/api/misty/drive',
    mistyStockPath: '/api/drive',
    category: 'Locomoção',
    title: 'Dirigir com Velocidade Linear e Angular',
    description:
      'Controla a base diferencial com velocidade linear (-100 a 100) e angular (-100 a 100), com opção de duração automática (durationMs) sem precisar de segunda chamada.',
    tier: 'Misty II Compatível',
    defaultBody: {
      linearVelocity: 35,
      angularVelocity: 15,
      durationMs: 2500,
    },
    params: [
      { name: 'linearVelocity', type: 'number (-100..100)', required: true, description: 'Velocidade para frente ou ré.' },
      { name: 'angularVelocity', type: 'number (-100..100)', required: true, description: 'Rotação no eixo Z (positivo gira à esquerda).' },
      { name: 'durationMs', type: 'number (opcional)', required: false, description: 'Para os motores automaticamente após N milissegundos.' },
    ],
  },
  {
    id: 'drive-track',
    method: 'POST',
    path: '/api/misty/drive/track',
    mistyStockPath: '/api/drive/track',
    category: 'Locomoção',
    title: 'Controle Direto de Esteiras (Tank)',
    description: 'Define velocidades independentes para a esteira esquerda e direita.',
    tier: 'Misty II Compatível',
    defaultBody: {
      leftTrackSpeed: 40,
      rightTrackSpeed: -40,
      durationMs: 1800,
    },
    params: [
      { name: 'leftTrackSpeed', type: 'number (-100..100)', required: true, description: 'Potência da esteira esquerda.' },
      { name: 'rightTrackSpeed', type: 'number (-100..100)', required: true, description: 'Potência da esteira direita.' },
      { name: 'durationMs', type: 'number (opcional)', required: false, description: 'Tempo opcional até parada automática.' },
    ],
  },
  {
    id: 'drive-waypoint',
    method: 'POST',
    path: '/api/misty/drive/waypoint',
    mistyStockPath: null,
    category: 'Locomoção',
    title: 'Navegação Autônoma por Waypoint (X, Y)',
    description:
      'Planeja rota até a coordenada (x, y) da arena com desvio reativo de obstáculos pelos sensores ToF frontais.',
    tier: 'Exclusivo v2',
    defaultBody: {
      x: 1.4,
      y: -0.9,
      speed: 45,
    },
    params: [
      { name: 'x', type: 'number (-2.7..2.7 m)', required: true, description: 'Coordenada X alvo no mapa SLAM.' },
      { name: 'y', type: 'number (-1.9..1.9 m)', required: true, description: 'Coordenada Y alvo no mapa SLAM.' },
      { name: 'speed', type: 'number (10..80)', required: false, description: 'Velocidade de cruzeiro até o destino.' },
    ],
  },
  {
    id: 'drive-stop',
    method: 'POST',
    path: '/api/misty/drive/stop',
    mistyStockPath: '/api/drive/stop',
    category: 'Locomoção',
    title: 'Parada Imediata de Motores',
    description: 'Interrompe locomoção e cancela navegação por waypoint ativa.',
    tier: 'Misty II Compatível',
    defaultBody: {},
    params: [],
  },
  {
    id: 'move-head',
    method: 'POST',
    path: '/api/misty/head',
    mistyStockPath: '/api/head',
    category: 'Cabeça & Braços',
    title: 'Mover Cabeça 3-DOF com Curva Easing',
    description:
      'Posiciona Pitch, Roll e Yaw da cabeça com interpolação suave configurável (linear, easeInOut ou spring).',
    tier: 'Misty II Compatível',
    defaultBody: {
      pitch: -12,
      roll: 10,
      yaw: 35,
      velocity: 70,
      easing: 'easeInOut',
    },
    params: [
      { name: 'pitch', type: 'number (-40..26)', required: true, description: 'Inclinação vertical (negativo olha para cima).' },
      { name: 'roll', type: 'number (-40..40)', required: true, description: 'Inclinação lateral.' },
      { name: 'yaw', type: 'number (-81..81)', required: true, description: 'Rotação esquerda/direita.' },
      { name: 'easing', type: 'linear | easeInOut | spring', required: false, description: 'Curva cinemática exclusiva v2.' },
    ],
  },
  {
    id: 'move-arms',
    method: 'POST',
    path: '/api/misty/arms',
    mistyStockPath: '/api/arms/set',
    category: 'Cabeça & Braços',
    title: 'Mover Braços Duplos (Esquerdo e Direito)',
    description: 'Posiciona ambos os braços em graus (-29 erguido a +90 abaixado).',
    tier: 'Misty II Compatível',
    defaultBody: {
      leftArmPosition: -15,
      rightArmPosition: 45,
      leftArmVelocity: 60,
      rightArmVelocity: 60,
    },
    params: [
      { name: 'leftArmPosition', type: 'number (-29..90)', required: true, description: 'Ângulo do braço esquerdo.' },
      { name: 'rightArmPosition', type: 'number (-29..90)', required: true, description: 'Ângulo do braço direito.' },
    ],
  },
  {
    id: 'pose-preset',
    method: 'POST',
    path: '/api/misty/pose/preset',
    mistyStockPath: null,
    category: 'Cabeça & Braços',
    title: 'Aplicar Expressão Corporal Composta',
    description:
      'Executa em um único comando atômico: cabeça, braços, LED RGB, humor dos olhos e texto no visor.',
    tier: 'Exclusivo v2',
    defaultBody: {
      preset: 'curious',
    },
    params: [
      {
        name: 'preset',
        type: 'greeting | curious | celebrate | alert | sleep | neutral',
        required: true,
        description: 'Nome da expressão composta.',
      },
    ],
  },
  {
    id: 'change-led',
    method: 'POST',
    path: '/api/misty/led',
    mistyStockPath: '/api/led',
    category: 'LED & Visor',
    title: 'Definir Cor Sólida do LED Torácico',
    description: 'Altera instantaneamente os canais RGB (0–255) do LED frontal do chassi.',
    tier: 'Misty II Compatível',
    defaultBody: {
      red: 14,
      green: 165,
      blue: 233,
    },
    params: [
      { name: 'red', type: 'number (0..255)', required: true, description: 'Intensidade do canal vermelho.' },
      { name: 'green', type: 'number (0..255)', required: true, description: 'Intensidade do canal verde.' },
      { name: 'blue', type: 'number (0..255)', required: true, description: 'Intensidade do canal azul.' },
    ],
  },
  {
    id: 'led-transition',
    method: 'POST',
    path: '/api/misty/led/transition',
    mistyStockPath: '/api/led/transition',
    category: 'LED & Visor',
    title: 'Animação Programável de LED (Breathe / Rainbow)',
    description: 'Ativa padrões contínuos de iluminação no LED sem loops externos no cliente.',
    tier: 'Exclusivo v2',
    defaultBody: {
      red: 16,
      green: 185,
      blue: 129,
      mode: 'breathe',
      periodMs: 1400,
    },
    params: [
      { name: 'mode', type: 'solid | breathe | blink | rainbow', required: true, description: 'Modo de animação.' },
      { name: 'periodMs', type: 'number (300..5000)', required: false, description: 'Período completo do ciclo em ms.' },
    ],
  },
  {
    id: 'set-eyes',
    method: 'POST',
    path: '/api/misty/eyes',
    mistyStockPath: '/api/images/display',
    category: 'LED & Visor',
    title: 'Renderizar Olhos Vetoriais e Texto no Visor',
    description:
      'Substitui imagens estáticas da API original por olhos vetoriais dinâmicos com direção de olhar (gazeX/gazeY) e legenda no visor.',
    tier: 'Exclusivo v2',
    defaultBody: {
      mood: 'happy',
      gazeX: 0.3,
      gazeY: -0.1,
      displayText: 'Olá! Pronto para operar.',
    },
    params: [
      { name: 'mood', type: 'neutral | happy | curious | surprised | processing | alert | sleepy', required: true, description: 'Expressão ocular.' },
      { name: 'gazeX', type: 'number (-1..1)', required: false, description: 'Direção horizontal das pupilas.' },
      { name: 'gazeY', type: 'number (-1..1)', required: false, description: 'Direção vertical das pupilas.' },
      { name: 'displayText', type: 'string', required: false, description: 'Texto exibido na faixa inferior do visor.' },
    ],
  },
  {
    id: 'tts-speak',
    method: 'POST',
    path: '/api/misty/tts/speak',
    mistyStockPath: '/api/tts/speak',
    category: 'Áudio & Fala',
    title: 'Síntese de Voz (TTS) com Áudio em Tempo Real',
    description:
      'Envia texto para fala com controle de velocidade e tom; o navegador reproduz a voz sintetizada e anima o visor.',
    tier: 'Misty II Compatível',
    defaultBody: {
      text: 'Sensores calibrados. Navegação autônoma iniciada.',
      rate: 1.0,
      pitch: 1.05,
      utteranceId: 'utt-01',
    },
    params: [
      { name: 'text', type: 'string', required: true, description: 'Texto a ser falado pelo robô.' },
      { name: 'rate', type: 'number (0.5..2.0)', required: false, description: 'Velocidade da fala.' },
      { name: 'pitch', type: 'number (0.5..2.0)', required: false, description: 'Altura tonal da voz.' },
    ],
  },
  {
    id: 'tts-stop',
    method: 'POST',
    path: '/api/misty/tts/stop',
    mistyStockPath: '/api/tts/stop',
    category: 'Áudio & Fala',
    title: 'Interromper Síntese de Voz (TTS)',
    description: 'Para imediatamente a fala atual no sintetizador do navegador e no hardware Misty II.',
    tier: 'Misty II Compatível',
    defaultBody: {},
    params: [],
  },
  {
    id: 'tts-synthesize',
    method: 'POST',
    path: '/api/misty/tts/synthesize',
    mistyStockPath: null,
    category: 'Áudio & Fala',
    title: 'Síntese Neural Nativa (pt-BR WAV)',
    description:
      'Gera áudio WAV (24kHz) com sotaque brasileiro nativo e prosódia natural via gemini-3.8-flash-lite-tts.',
    tier: 'Exclusivo v2',
    defaultBody: {
      text: 'Oi, tudo bem? Sou a Misty dois, pronta para te ajudar aqui no laboratório.',
      voiceName: 'Kore',
      style: 'natural',
    },
    params: [
      { name: 'text', type: 'string', required: true, description: 'Texto em português para sintetizar.' },
      { name: 'voiceName', type: 'Kore | Zephyr | Puck | Charon | Fenrir', required: false, description: 'Persona vocal.' },
      { name: 'style', type: 'natural | friendly | lab | calm | enthusiastic', required: false, description: 'Estilo de fala brasileira.' },
    ],
  },
  {
    id: 'audio-tone',
    method: 'POST',
    path: '/api/misty/audio/tone',
    mistyStockPath: null,
    category: 'Áudio & Fala',
    title: 'Sintetizador de Sinal Sonoro (WebAudio)',
    description: 'Emite bipes de feedback ou tons musicais diretamente pelo sintetizador do robô.',
    tier: 'Exclusivo v2',
    defaultBody: {
      frequency: 587,
      durationMs: 260,
      waveform: 'triangle',
    },
    params: [
      { name: 'frequency', type: 'number (120..2000 Hz)', required: true, description: 'Frequência do tom.' },
      { name: 'durationMs', type: 'number (50..2000)', required: true, description: 'Duração do sinal.' },
      { name: 'waveform', type: 'sine | triangle | square', required: false, description: 'Forma de onda.' },
    ],
  },
  {
    id: 'get-state',
    method: 'GET',
    path: '/api/misty/state',
    mistyStockPath: null,
    category: 'Sensores & SLAM',
    title: 'Snapshot Unificado de Telemetria',
    description:
      'Retorna todo o estado do robô (IMU, 8x ToF, Bump, CapTouch, Bateria, Pose SLAM, Cabeça, Braços) em uma única chamada REST.',
    tier: 'Exclusivo v2',
    params: [],
  },
  {
    id: 'get-slam-map',
    method: 'GET',
    path: '/api/misty/slam/map',
    mistyStockPath: '/api/slam/map',
    category: 'Sensores & SLAM',
    title: 'Ler Mapa SLAM e Obstáculos da Arena',
    description: 'Obtém posição atual, trilha de odometria e geometria dos obstáculos mapeados.',
    tier: 'Misty II Compatível',
    params: [],
  },
  {
    id: 'slam-reset',
    method: 'POST',
    path: '/api/misty/slam/reset',
    mistyStockPath: '/api/slam/reset',
    category: 'Sensores & SLAM',
    title: 'Resetar Odometria e Pose Inicial',
    description: 'Reposiciona a Misty no centro (0, 0) da arena e limpa a trilha de odometria.',
    tier: 'Misty II Compatível',
    defaultBody: {},
    params: [],
  },
  {
    id: 'touch-simulate',
    method: 'POST',
    path: '/api/misty/touch/simulate',
    mistyStockPath: null,
    category: 'Sensores & SLAM',
    title: 'Simular Toque Capacitivo ou Colisão',
    description: 'Dispara um evento de toque na cabeça ou para-choque para testar regras reativas.',
    tier: 'Exclusivo v2',
    defaultBody: {
      sensor: 'chin',
      kind: 'capTouch',
    },
    params: [
      { name: 'kind', type: 'capTouch | bump', required: true, description: 'Tipo do sensor.' },
      { name: 'sensor', type: 'chin | headFront | headBack | frontLeft...', required: true, description: 'Identificador do sensor.' },
    ],
  },
  {
    id: 'vision-scan',
    method: 'POST',
    path: '/api/misty/vision/scan',
    mistyStockPath: '/api/faces/detection/start',
    category: 'Visão Computacional',
    title: 'Varredura de Visão (Rostos, Objetos, AprilTags)',
    description:
      'Executa uma inferência simulada na câmera RGB/profundidade e devolve entidades detectadas com distância e ângulo.',
    tier: 'Exclusivo v2',
    defaultBody: {
      detectFaces: true,
      detectObjects: true,
      detectAprilTags: true,
    },
    params: [
      { name: 'detectFaces', type: 'boolean', required: false, description: 'Incluir detecção facial.' },
      { name: 'detectObjects', type: 'boolean', required: false, description: 'Incluir objetos da arena.' },
      { name: 'detectAprilTags', type: 'boolean', required: false, description: 'Incluir marcadores fiduciais.' },
    ],
  },
  {
    id: 'camera-rgb',
    method: 'GET',
    path: '/api/misty/camera/rgb?base64=true&width=640&height=480',
    mistyStockPath: '/api/cameras/rgb',
    category: 'Visão Computacional',
    title: 'Capturar Câmera Frontal RGB (Foto / Base64)',
    description:
      'Captura um quadro da câmera frontal de 4K da Misty II em modo Ponte Hardware ou gera vista em primeira pessoa (POV) sincronizada no Simulador.',
    tier: 'Misty II Compatível',
    params: [
      { name: 'base64', type: 'boolean (query)', required: false, description: 'Retorna imagem codificada em Base64 + dataUrl.' },
      { name: 'width', type: 'number (query, padrão 640)', required: false, description: 'Largura desejada em pixels.' },
      { name: 'height', type: 'number (query, padrão 480)', required: false, description: 'Altura desejada em pixels.' },
    ],
  },
  {
    id: 'camera-depth',
    method: 'GET',
    path: '/api/misty/camera/depth?width=640&height=480',
    mistyStockPath: '/api/cameras/depth',
    category: 'Visão Computacional',
    title: 'Capturar Mapa de Profundidade (Depth Sensor)',
    description:
      'Captura mapa térmico de distância do sensor Structure Core da Misty II ou gera mapa de profundidade por raycasting no Simulador.',
    tier: 'Misty II Compatível',
    params: [
      { name: 'width', type: 'number (query, padrão 640)', required: false, description: 'Largura da visualização.' },
      { name: 'height', type: 'number (query, padrão 480)', required: false, description: 'Altura da visualização.' },
    ],
  },
  {
    id: 'camera-fisheye',
    method: 'GET',
    path: '/api/misty/camera/fisheye?width=640&height=480',
    mistyStockPath: '/api/cameras/fisheye',
    category: 'Visão Computacional',
    title: 'Capturar Câmera Grande-Angular SLAM (Fisheye)',
    description:
      'Captura quadro monocromático de campo amplo usado pelo sistema de localização visual SLAM da Misty II.',
    tier: 'Misty II Compatível',
    params: [
      { name: 'width', type: 'number (query, padrão 640)', required: false, description: 'Largura desejada.' },
      { name: 'height', type: 'number (query, padrão 480)', required: false, description: 'Altura desejada.' },
    ],
  },
  {
    id: 'camera-stream-start',
    method: 'POST',
    path: '/api/misty/camera/stream/start',
    mistyStockPath: '/api/avstreaming/start',
    category: 'Visão Computacional',
    title: 'Iniciar Stream de Vídeo (/pubsub)',
    description:
      'Ativa envio contínuo de quadros (CameraFrame) via WebSocket /pubsub selecionando entre câmera frontal RGB, profundidade ou fisheye.',
    tier: 'Exclusivo v2',
    defaultBody: {
      streamType: 'rgb',
      width: 640,
      height: 480,
      fps: 3,
    },
    params: [
      { name: 'streamType', type: 'rgb | depth | fisheye', required: false, description: 'Fluxo de vídeo desejado.' },
      { name: 'width', type: 'number (320..1280)', required: false, description: 'Largura do frame.' },
      { name: 'height', type: 'number (240..720)', required: false, description: 'Altura do frame.' },
      { name: 'fps', type: 'number (1..6)', required: false, description: 'Quadros por segundo no /pubsub.' },
    ],
  },
  {
    id: 'camera-stream-stop',
    method: 'POST',
    path: '/api/misty/camera/stream/stop',
    mistyStockPath: '/api/avstreaming/stop',
    category: 'Visão Computacional',
    title: 'Encerrar Stream da Câmera Frontal',
    description: 'Interrompe a transmissão contínua de quadros da câmera frontal no WebSocket.',
    tier: 'Misty II Compatível',
    defaultBody: {},
    params: [],
  },
  {
    id: 'batch-exec',
    method: 'POST',
    path: '/api/misty/batch',
    mistyStockPath: null,
    category: 'Coreografia & Batch',
    title: 'Execução em Lote Atômica (Batch Macro)',
    description:
      'Executa uma fila sequencial de comandos heterogêneos com atraso entre passos em uma única requisição HTTP.',
    tier: 'Exclusivo v2',
    defaultBody: {
      steps: [
        { endpoint: '/api/misty/led', body: { red: 14, green: 165, blue: 233 }, delayMs: 0 },
        { endpoint: '/api/misty/head', body: { pitch: -15, roll: 0, yaw: 25, easing: 'spring' }, delayMs: 400 },
        { endpoint: '/api/misty/eyes', body: { mood: 'happy', displayText: 'Batch executado!' }, delayMs: 400 },
        { endpoint: '/api/misty/tts/speak', body: { text: 'Sequência em lote concluída com sucesso.' }, delayMs: 500 },
      ],
    },
    params: [
      { name: 'steps', type: 'Array<{ endpoint, body, delayMs }>', required: true, description: 'Lista ordenada de comandos e intervalos.' },
    ],
  },
  {
    id: 'run-choreography',
    method: 'POST',
    path: '/api/misty/choreography/run',
    mistyStockPath: null,
    category: 'Coreografia & Batch',
    title: 'Reproduzir Coreografia por ID',
    description: 'Inicia no servidor a reprodução sincronizada de uma linha do tempo de keyframes.',
    tier: 'Exclusivo v2',
    defaultBody: {
      choreographyId: 'chor-greeting',
    },
    params: [
      { name: 'choreographyId', type: 'string', required: true, description: 'ID da coreografia salva no servidor.' },
    ],
  },
  {
    id: 'get-device',
    method: 'GET',
    path: '/api/misty/device',
    mistyStockPath: '/api/device',
    category: 'Sistema & Ponte',
    title: 'Informações de Hardware e Firmware',
    description: 'Retorna modelo, número de série, versão da API e tempo de atividade.',
    tier: 'Misty II Compatível',
    params: [],
  },
  {
    id: 'get-battery',
    method: 'GET',
    path: '/api/misty/battery',
    mistyStockPath: '/api/battery',
    category: 'Sistema & Ponte',
    title: 'Status Detalhado da Bateria',
    description: 'Retorna porcentagem, tensão (V), corrente (A) e status de carregamento.',
    tier: 'Misty II Compatível',
    params: [],
  },
  {
    id: 'get-logs',
    method: 'GET',
    path: '/api/misty/logs',
    mistyStockPath: null,
    category: 'Sistema & Ponte',
    title: 'Auditoria de Requisições da API',
    description: 'Lista as últimas chamadas recebidas pelo servidor REST (UI, externos, automações).',
    tier: 'Exclusivo v2',
    params: [],
  },
  {
    id: 'ai-chat',
    method: 'POST',
    path: '/api/misty/ai/chat',
    mistyStockPath: null,
    category: 'Sistema & Ponte',
    title: 'Agente IA Embarcado com Function Calling',
    description:
      'Conversa com a Misty usando Gemini no servidor; a IA pode acionar movimentos, cabeça, braços, expressões, câmera e coreografias automaticamente.',
    tier: 'Exclusivo v2',
    defaultBody: {
      message: 'Faça uma saudação amigável e informe seu nível de bateria.',
      includeCamera: false,
      autoSpeak: true,
    },
    params: [
      { name: 'message', type: 'string', required: true, description: 'Instrução ou pergunta para a Misty.' },
      { name: 'includeCamera', type: 'boolean', required: false, description: 'Anexa quadro atual da câmera.' },
      { name: 'autoSpeak', type: 'boolean', required: false, description: 'Reproduz a resposta via TTS automaticamente.' },
    ],
  },
  {
    id: 'ai-analyze-scene',
    method: 'POST',
    path: '/api/misty/ai/analyze-scene',
    mistyStockPath: null,
    category: 'Visão Computacional',
    title: 'Análise Multimodal de Ambiente (IA)',
    description:
      'Captura câmera + ToF + visão computacional e pede à IA um diagnóstico de obstáculos e segurança.',
    tier: 'Exclusivo v2',
    defaultBody: {
      streamType: 'rgb',
      autoSpeak: true,
    },
    params: [
      { name: 'streamType', type: 'rgb | depth | fisheye', required: false, description: 'Fluxo de câmera utilizado.' },
      { name: 'autoSpeak', type: 'boolean', required: false, description: 'Lê o diagnóstico em voz alta.' },
    ],
  },
];
