# Sorteo App - Resumen de Tecnologías y Funcionalidades

## Descripción General

**Sorteo App** es una aplicación web full-stack para realizar sorteos en tiempo real. Permite a un organizador crear un juego de sorteo, compartir un código QR para que los participantes se inscriban, y ejecutar una animación de "balota" (slot machine) que selecciona aleatoriamente un ganador. Todos los participantes conectados ven el resultado del ganador simultáneamente en sus dispositivos móviles gracias a la comunicación en tiempo real vía WebSocket.

---

## Arquitectura del Sistema

La aplicación sigue una arquitectura de dos roles principales:

- **Organizador**: Crea el sorteo con un PIN de seguridad, visualiza el código QR para compartir, ve la lista de participantes en tiempo real, ejecuta la animación de la balota, y tiene acceso a controles exclusivos (JUGAR, Descargar Excel, Reiniciar Sorteo). El acceso del organizador está protegido por PIN; los participantes no tienen acceso a ningún control.

- **Participante**: Escanea el código QR desde su teléfono, llena un formulario de inscripción (nombre, correo electrónico, WhatsApp), y queda en una pantalla de espera ("¡Estás Inscrito!") hasta que el organizador ejecuta el sorteo. En ese momento, el participante ve directamente el nombre del ganador con una celebración de confetti, sin ver la animación de la balota.

---

## Tecnologías Utilizadas

### Frontend

| Tecnología | Versión | Uso |
|---|---|---|
| **Next.js** | 16.1.1 | Framework React con renderizado del lado del servidor (SSR), enrutamiento basado en archivos y API routes integradas |
| **React** | 19.0.0 | Librería de UI para construir la interfaz de usuario con componentes reutilizables |
| **TypeScript** | 5.x | Superset de JavaScript con tipado estático para mayor seguridad y mantenibilidad del código |
| **Tailwind CSS** | 4.x | Framework de CSS utility-first para el diseño responsivo y la personalización visual |
| **shadcn/ui** | - | Librería de componentes UI construidos sobre Radix UI, con variantes y estilos personalizables |
| **Radix UI** | Varía por componente | Primitivos de UI accesibles (Dialog, Tooltip, Select, Tabs, etc.) que sirven de base para shadcn/ui |
| **Framer Motion** | 12.23.2 | Librería de animaciones para transiciones y movimientos fluidos en la interfaz |
| **canvas-confetti** | 1.9.4 | Efecto de confetti en canvas cuando se revela el ganador |
| **qrcode.react** | 4.2.0 | Generación de códigos QR como SVG para compartir el enlace de inscripción |
| **XLSX (SheetJS)** | 0.18.5 | Exportación de datos de participantes a archivos Excel (.xlsx) |
| **Lucide React** | 0.525.0 | Librería de iconos SVG para la interfaz |

### Backend y Base de Datos

| Tecnología | Versión | Uso |
|---|---|---|
| **Next.js API Routes** | 16.1.1 | Endpoints RESTful integrados en el framework: creación de juegos, inscripción, inicio de sorteo, reinicio, exportación |
| **Prisma ORM** | 6.11.1 | ORM para modelado de datos, migraciones y consultas type-safe a la base de datos |
| **SQLite** | - | Base de datos embebida ligera, ideal para el alcance de la aplicación sin necesidad de servidor externo |
| **Socket.io** | 4.8.3 (server + client) | Comunicación bidireccional en tiempo real vía WebSocket entre organizador y participantes |
| **uuid** | 11.1.0 | Generación de identificadores únicos |

### Servidor WebSocket Independiente

La aplicación incluye un mini-servicio WebSocket ejecutándose en el **puerto 3003** (`/mini-services/sorteo-ws/index.ts`), separado del servidor principal de Next.js (puerto 3000). Este servidor gestiona:

- Salas de juego (`game-{gameId}`) para comunicación grupal
- Eventos en tiempo real: registro de participantes, inicio de sorteo, selección de ganador, reinicio de juego
- Estado en memoria sincronizado con la base de datos a través de las API routes
- Soporte para acceso local (localhost:3003) y acceso externo mediante proxy Caddy con `XTransformPort=3003`

### Infraestructura y Despliegue

| Componente | Uso |
|---|---|
| **Caddy** | Reverse proxy con soporte para WebSocket, manejo de la gateway con `XTransformPort` |
| **Bun** | Runtime de JavaScript alternativo para ejecución en producción |
| **Prisma CLI** | Comandos de migración y sincronización de esquema (`db:push`, `db:migrate`, `db:generate`) |

### Herramientas de Desarrollo

| Tecnología | Uso |
|---|---|
| **ESLint** | Linting y análisis estático del código |
| **PostCSS** | Procesamiento de CSS con plugins de Tailwind |
| **zod** | Validación de esquemas y datos de entrada |
| **React Hook Form** | Manejo de formularios con validación integrada |
| **Zustand** | Estado global ligero (disponible en dependencias) |
| **TanStack React Query** | Gestión de estado asíncrono y caché de datos del servidor |
| **Sonner** | Notificaciones toast elegantes |

---

## Modelo de Datos (Prisma Schema)

### GameSession

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String (CUID) | Identificador único del juego |
| `pin` | String (unique) | PIN de acceso del organizador (mínimo 4 caracteres) |
| `status` | String | Estado del juego: `waiting`, `spinning`, `finished` |
| `winnerId` | String (nullable) | ID del participante ganador |
| `participants` | Relation | Relación uno-a-muchos con Participant |
| `createdAt` | DateTime | Fecha de creación |
| `updatedAt` | DateTime | Fecha de última actualización |

### Participant

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String (CUID) | Identificador único del participante |
| `name` | String | Nombre completo |
| `email` | String | Correo electrónico |
| `whatsapp` | String | Número de WhatsApp |
| `gameSessionId` | String (FK) | Referencia al GameSession |
| `isWinner` | Boolean | Indica si es el ganador (default: false) |
| `createdAt` | DateTime | Fecha de inscripción |

**Restricciones únicas**: La combinación `[email, gameSessionId]` y `[whatsapp, gameSessionId]` son únicas, lo que impide que una misma persona se inscriba dos veces en el mismo sorteo con el mismo correo o WhatsApp.

---

## API Routes

### `POST /api/game` - Crear juego
Crea una nueva sesión de sorteo con un PIN proporcionado. Valida que el PIN tenga al menos 4 caracteres y que no esté en uso.

### `GET /api/game` - Obtener juego
Busca una sesión de juego por `gameId` o `pin`. Retorna la sesión con todos sus participantes.

### `POST /api/game/join` - Inscribir participante
Registra un nuevo participante en un juego. Valida campos obligatorios y verifica duplicados de email y WhatsApp dentro de la misma sesión.

### `POST /api/game/start` - Iniciar sorteo
Selecciona aleatoriamente un ganador de los participantes inscritos y retorna la información del ganador.

### `PUT /api/game/start` - Confirmar ganador
Confirma al ganador después de que la animación de la balota termina, actualizando la base de datos.

### `POST /api/game/reset` - Reiniciar sorteo
Elimina todos los participantes de la sesión actual, elimina la sesión, y crea una nueva sesión con un nuevo PIN (lo que genera un nuevo código QR).

### `GET /api/game/export` - Exportar participantes
Retorna los datos de los participantes en formato JSON para su conversión a Excel desde el frontend.

---

## Eventos WebSocket (Socket.io)

| Evento | Dirección | Descripción |
|---|---|---|
| `join-game` | Cliente → Servidor | Unirse a la sala de un juego específico con rol (organizer/participant) |
| `participant-registered` | Cliente → Servidor | Notificar que un nuevo participante se inscribió vía API |
| `participant-added` | Servidor → Clientes | Broadcast a la sala: nuevo participante agregado |
| `participant-count` | Servidor → Clientes | Broadcast a la sala: conteo actualizado de participantes |
| `start-spin` | Cliente → Servidor | El organizador inicia el sorteo |
| `spin-started` | Servidor → Clientes | Broadcast a la sala: el sorteo ha comenzado |
| `winner-selected` | Cliente → Servidor | El organizador confirma el ganador después de la animación |
| `spin-result` | Servidor → Clientes | Broadcast a la sala: resultado del ganador |
| `reset-game` | Cliente → Servidor | El organizador reinicia el juego |
| `game-reset` | Servidor → Clientes | Broadcast a la sala: el juego se ha reiniciado |
| `game-state` | Servidor → Cliente | Estado completo del juego enviado a un cliente recién conectado |
| `sync-participants` | Cliente → Servidor | Sincronizar participantes desde la base de datos |

---

## Flujo de la Aplicación

### 1. Creación del Sorteo
1. El organizador accede a la app y hace clic en "Crear Sorteo"
2. Ingresa un PIN de al menos 4 caracteres
3. Se crea la sesión de juego y se genera un código QR único
4. El organizador ve la vista de organizador con: QR, contador de participantes, lista de participantes, componente Balota/SlotMachine y controles

### 2. Inscripción de Participantes
1. Los participantes escanean el código QR con su teléfono
2. Son dirigidos a un formulario donde ingresan nombre, correo electrónico y WhatsApp
3. Al hacer clic en "Participar", el sistema valida que no existan duplicados (email o WhatsApp ya registrados en el mismo juego)
4. Si la inscripción es exitosa, ven la pantalla "¡Estás Inscrito!" con indicador de espera
5. El organizador ve en tiempo real cómo se incrementa el contador y la lista de participantes

### 3. Ejecución del Sorteo
1. El organizador hace clic en "JUGAR"
2. La API selecciona aleatoriamente un ganador y retorna su ID
3. El componente SlotMachine muestra la animación de balota: 3 nombres visibles (anterior, actual, siguiente) que se desplazan de derecha a izquierda con desaceleración progresiva durante ~5 segundos
4. Al detenerse, se aplica un efecto de zoom + flash neón sobre el nombre ganador
5. Se dispara confetti con los colores del tema (neón verde, púrpura, cian)
6. Los participantes en sus teléfonos ven directamente el nombre del ganador con celebración (no ven la animación de la balota, solo el resultado final)

### 4. Post-Sorteo
1. El organizador puede descargar un archivo Excel con todos los datos de los participantes inscritos
2. Puede hacer clic en "Volver a Iniciar" para reiniciar el sorteo
3. Al reiniciar: se eliminan todos los participantes, se crea una nueva sesión con nuevo PIN y nuevo QR
4. Los participantes conectados son redirigidos automáticamente a la pantalla de inicio

---

## Diseño Visual

La aplicación utiliza un tema oscuro inspirado en [lasucursaldigital.com](https://lasucursaldigital.com/) con los siguientes elementos:

- **Fondo principal**: `#0a0a1a` (azul oscuro profundo)
- **Tarjetas y contenedores**: `#111127` (azul oscuro con matiz púrpura)
- **Bordes**: `#1a1a3e` (azul-gris oscuro)
- **Neón verde**: `#00ff8a` (color primario, acentos, botones principales, brillos)
- **Neón púrpura**: `#8e00ff` (color secundario, gradientes, acentos)
- **Neón cian**: `#00d9ff` (color terciario, botones de exportación)
- **Texto principal**: `#e0e0f0` (blanco suave)
- **Texto secundario**: `#8888aa` (gris azulado)

### Efectos CSS personalizados
- **neon-border**: Bordes con resplandor verde neón
- **neon-border-purple**: Bordes con resplandor púrpura
- **neon-text / neon-text-purple**: Texto con efecto de resplandor neón
- **neon-glow / neon-glow-purple**: Cajas con resplandor intenso
- **gradient-text**: Texto con degradado púrpura → verde
- **gradient-border**: Bordes con degradado animado
- **animate-pulse-neon**: Pulsación de brillo neón
- **animate-float**: Flotación suave para íconos
- **shimmer**: Efecto de brillo deslizante

---

## Estructura de Archivos Clave

```
src/
├── app/
│   ├── page.tsx                    # Componente principal con todas las vistas
│   ├── globals.css                 # Estilos globales y tema neón
│   ├── layout.tsx                  # Layout raíz
│   └── api/
│       └── game/
│           ├── route.ts            # Crear/obtener juego
│           ├── join/route.ts       # Inscribir participante
│           ├── start/route.ts      # Iniciar sorteo / confirmar ganador
│           ├── reset/route.ts      # Reiniciar juego
│           └── export/route.ts     # Exportar datos de participantes
├── components/
│   ├── SlotMachine.tsx             # Componente de balota/slot machine (3 nombres, animación de desaceleración)
│   ├── SpinWheel.tsx               # Componente anterior de ruleta (reemplazado por SlotMachine)
│   └── ui/                         # Componentes shadcn/ui
├── hooks/
│   └── use-toast.ts                # Hook para notificaciones toast
└── lib/
    └── db.ts                       # Instancia de Prisma Client

mini-services/
└── sorteo-ws/
    └── index.ts                    # Servidor Socket.io independiente (puerto 3003)

prisma/
└── schema.prisma                   # Esquema de base de datos (GameSession + Participant)
```

---

## Resumen Técnico

| Aspecto | Detalle |
|---|---|
| **Framework** | Next.js 16 con App Router |
| **Lenguaje** | TypeScript |
| **Base de datos** | SQLite vía Prisma ORM |
| **Tiempo real** | Socket.io (mini-servicio en puerto 3003) |
| **UI** | React 19 + Tailwind CSS 4 + shadcn/ui |
| **Animación** | SlotMachine (3 nombres horizontales, desaceleración ~5s, zoom + flash neón) |
| **Confetti** | canvas-confetti con colores del tema |
| **Exportación** | SheetJS (XLSX) para Excel de participantes |
| **QR** | qrcode.react (SVG) |
| **Validación** | Duplicados de email y WhatsApp por sesión |
| **Seguridad** | PIN de organizador; participantes sin acceso a controles |
| **Proxy** | Caddy con XTransformPort para gateway WebSocket |
