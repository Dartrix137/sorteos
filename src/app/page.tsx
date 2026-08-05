"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import confetti from "canvas-confetti";
import * as XLSX from "xlsx";
import SlotMachine from "@/components/SlotMachine";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type View =
  | "welcome"
  | "create-game"
  | "organizer"
  | "organizer-spinning"
  | "participant-form"
  | "participant-waiting"
  | "winner";

type Participant = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  isWinner?: boolean;
};

type GameSession = {
  id: string;
  pin: string;
  status: string;
  participants: Participant[];
};

export default function Home() {
  const [view, setView] = useState<View>("welcome");
  const [pin, setPin] = useState("");
  const [gameId, setGameId] = useState("");
  const [game, setGame] = useState<GameSession | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [winner, setWinner] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [isSpinning, setIsSpinning] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState<"organizer" | "participant" | null>(null);
  const [socketReady, setSocketReady] = useState(false);

  // Participant form
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWhatsapp, setFormWhatsapp] = useState("");
  const [formError, setFormError] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const gameIdRef = useRef<string>("");
  const roleRef = useRef<"organizer" | "participant" | null>(null);
  const { toast } = useToast();

  // Keep refs in sync
  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  // Get the base URL for QR code
  const getBaseUrl = () => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "";
  };

  // Initialize WebSocket
  useEffect(() => {
    // Use XTransformPort through gateway for external access,
    // or direct connection for localhost
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    const socketInstance = isLocalhost
      ? io(`http://${window.location.hostname}:3003`, {
          transports: ["websocket", "polling"],
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          timeout: 10000,
        })
      : io("/?XTransformPort=3003", {
          transports: ["websocket", "polling"],
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          timeout: 10000,
        });

    socketRef.current = socketInstance;

    socketInstance.on("connect", () => {
      console.log("WebSocket connected");
      setSocketReady(true);

      // Auto-join game room if we have a gameId
      if (gameIdRef.current && roleRef.current) {
        console.log(
          `Auto-joining game room: ${gameIdRef.current} as ${roleRef.current}`,
        );
        socketInstance.emit("join-game", {
          gameId: gameIdRef.current,
          role: roleRef.current,
        });
      }
    });

    socketInstance.on("disconnect", () => {
      console.log("WebSocket disconnected");
      setSocketReady(false);
    });

    // Real-time events
    socketInstance.on("participant-added", (participant: Participant) => {
      console.log("Participant added via WS:", participant.name);
      setParticipants((prev) => {
        if (!prev.find((p) => p.id === participant.id)) {
          return [...prev, participant];
        }
        return prev;
      });
      setParticipantCount((prev) => prev + 1);
    });

    socketInstance.on("participant-count", (count: number) => {
      console.log("Participant count via WS:", count);
      setParticipantCount(count);
    });

    socketInstance.on("spin-started", (data: { gameId: string }) => {
      console.log("Spin started via WS for game:", data.gameId);
      setIsSpinning(true);
      setView((prev) => {
        if (prev === "organizer") return "organizer-spinning";
        // A participant still looking at a previous winner moves back to
        // the waiting screen instead of showing a stale winner name.
        // Someone mid-registration keeps their form untouched.
        if (prev === "winner") return "participant-waiting";
        return prev;
      });
    });

    socketInstance.on(
      "spin-result",
      (data: { winner: { id: string; name: string } }) => {
        console.log("Spin result via WS:", data.winner.name);
        setWinner(data.winner);
        setIsSpinning(false);
        setView("winner");

        // Trigger confetti
        triggerConfetti();
      },
    );

    socketInstance.on("game-reset", (data: { gameId: string }) => {
      console.log("Game reset via WS:", data.gameId);
      // Only reset participants (don't redirect organizer)
      setParticipants([]);
      setParticipantCount(0);
      setWinner(null);
      setIsSpinning(false);
      setWinnerId(null);
      if (roleRef.current === "participant") {
        setView("welcome");
      }
    });

    socketInstance.on(
      "game-state",
      (state: {
        participants: Participant[];
        status: string;
        winner: { id: string; name: string } | null;
      }) => {
        console.log("Game state received:", state);
        setParticipants(state.participants);
        setParticipantCount(state.participants.length);
        if (state.status === "spinning") {
          setIsSpinning(true);
        }
        if (state.winner) {
          setWinner(state.winner);
        }
      },
    );

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Join game room when gameId and role are set
  const joinGameRoom = useCallback(
    (gId: string, r: "organizer" | "participant") => {
      if (socketRef.current && socketRef.current.connected) {
        console.log(`Joining game room: ${gId} as ${r}`);
        socketRef.current.emit("join-game", { gameId: gId, role: r });
      }
    },
    [],
  );

  // Check URL params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameParam = params.get("game");
    const adminParam = params.get("admin");

    if (gameParam && adminParam) {
      setGameId(gameParam);
      setRole("organizer");
      roleRef.current = "organizer";
      gameIdRef.current = gameParam;
      fetchGame(gameParam, "organizer");
    } else if (gameParam) {
      setGameId(gameParam);
      setRole("participant");
      roleRef.current = "participant";
      gameIdRef.current = gameParam;
      fetchGameForParticipant(gameParam);
    }
  }, []);

  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;
    const colors = ["#00ff8a", "#8e00ff", "#00d9ff", "#00ffbf", "#6a00ff"];

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const fetchGame = async (id: string, r: "organizer" | "participant") => {
    try {
      const res = await fetch(`/api/game?gameId=${id}`);
      const data = await res.json();
      if (data.game) {
        setGame(data.game);
        setParticipants(data.game.participants);
        setParticipantCount(data.game.participants.length);
        joinGameRoom(id, r);
        setView("organizer");
      }
    } catch (error) {
      console.error("Error fetching game:", error);
    }
  };

  const fetchGameForParticipant = async (id: string) => {
    try {
      const res = await fetch(`/api/game?gameId=${id}`);
      const data = await res.json();
      if (data.game) {
        setGame(data.game);
        if (data.game.status === "spinning") {
          // Participants stay on waiting screen during spin
          joinGameRoom(id, "participant");
          setView("participant-waiting");
          return;
        }
        joinGameRoom(id, "participant");
        setView("participant-form");
      }
    } catch (error) {
      console.error("Error fetching game:", error);
    }
  };

  const handleCreateGame = async () => {
    if (pin.length < 4) {
      toast({
        title: "Error",
        description: "El PIN debe tener al menos 4 caracteres",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      setGame(data.game);
      setGameId(data.game.id);
      gameIdRef.current = data.game.id;
      setRole("organizer");
      roleRef.current = "organizer";
      joinGameRoom(data.game.id, "organizer");

      // Update URL without reload
      window.history.pushState({}, "", `?game=${data.game.id}&admin=${pin}`);
      setView("organizer");
    } catch (error) {
      console.error("Error creating game:", error);
      toast({
        title: "Error",
        description: "Error al crear el juego",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleParticipate = async () => {
    setFormError("");

    if (!formName.trim() || !formEmail.trim() || !formWhatsapp.trim()) {
      setFormError("Todos los campos son obligatorios");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formEmail.trim())) {
      setFormError("Ingresa un correo electrónico válido");
      return;
    }

    const phoneDigits = formWhatsapp.replace(/[\s\-().+]/g, "");
    if (!/^\d{7,15}$/.test(phoneDigits)) {
      setFormError(
        "Ingresa un número de WhatsApp válido (solo dígitos, mínimo 7)",
      );
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/game/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          name: formName.trim(),
          email: formEmail.trim(),
          whatsapp: formWhatsapp.trim(),
        }),
      });
      const data = await res.json();

      if (data.error) {
        setFormError(data.error);
        return;
      }

      // Make sure we're in the game room
      joinGameRoom(gameId, "participant");

      // Notify via WebSocket so organizer sees the update
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("participant-registered", {
          gameId,
          participant: data.participant,
        });
      }

      setView("participant-waiting");
    } catch (error) {
      console.error("Error joining game:", error);
      setFormError("Error al inscribirse");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSpin = async () => {
    if (participants.length === 0) {
      toast({
        title: "Error",
        description: "No hay participantes inscritos",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      // Set the winner ID for the wheel animation
      setWinnerId(data.winner.id);
      setIsSpinning(true);
      setView("organizer-spinning");

      // Notify all participants to start spinning
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("start-spin", { gameId });
      }
    } catch (error) {
      console.error("Error starting spin:", error);
      toast({
        title: "Error",
        description: "Error al iniciar el sorteo",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpinComplete = useCallback(
    async (spinWinner: { id: string; name: string }) => {
      setWinner(spinWinner);
      setIsSpinning(false);

      // Confirm winner in backend
      try {
        await fetch("/api/game/start", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId, winnerId: spinWinner.id }),
        });
      } catch (error) {
        console.error("Error confirming winner:", error);
      }

      // Notify all participants
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("winner-selected", {
          gameId,
          winner: spinWinner,
        });
      }

      setView("winner");
      triggerConfetti();
    },
    [gameId],
  );

  const handleExportExcel = async () => {
    try {
      const res = await fetch(`/api/game/export?gameId=${gameId}`);
      const data = await res.json();

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      if (!data.participants || data.participants.length === 0) {
        toast({
          title: "Error",
          description: "No hay participantes para exportar",
          variant: "destructive",
        });
        return;
      }

      const ws = XLSX.utils.json_to_sheet(data.participants);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Participantes");

      // Auto-size columns
      const colWidths = Object.keys(data.participants[0] || {}).map((key) => ({
        wch: Math.max(
          key.length,
          ...data.participants.map(
            (p: Record<string, unknown>) => String(p[key] || "").length,
          ),
        ),
      }));
      ws["!cols"] = colWidths;

      XLSX.writeFile(
        wb,
        `sorteo_participantes_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast({ title: "Éxito", description: "Excel descargado correctamente" });
    } catch (error) {
      console.error("Error exporting:", error);
      toast({
        title: "Error",
        description: "Error al descargar Excel",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/game/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      // Notify all participants about reset
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("reset-game", { gameId });
      }

      // Update state with new game
      setGame(data.game);
      setGameId(data.game.id);
      gameIdRef.current = data.game.id;
      setParticipants([]);
      setParticipantCount(0);
      setWinner(null);
      setIsSpinning(false);
      setWinnerId(null);

      // Update URL
      window.history.pushState(
        {},
        "",
        `?game=${data.game.id}&admin=${data.game.pin}`,
      );

      // Join new game room
      joinGameRoom(data.game.id, "organizer");

      setView("organizer");
      toast({ title: "Éxito", description: "Sorteo reiniciado con nuevo QR" });
    } catch (error) {
      console.error("Error resetting:", error);
      toast({
        title: "Error",
        description: "Error al reiniciar el sorteo",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // =================== WELCOME VIEW ===================
  if (view === "welcome") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a1a] relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#8e00ff] opacity-10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#00ff8a] opacity-10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 text-center max-w-md w-full">
          <div className="mb-8 animate-float">
            <span className="text-7xl">🎰</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-2 gradient-text">
            CREASORTEOS
          </h1>
          <p className="text-[#8888aa] mb-8 text-sm">
            Escanea el QR o ingresa como organizador
          </p>

          <div className="space-y-4">
            <Button
              onClick={() => setView("create-game")}
              className="w-full py-6 text-lg font-bold bg-gradient-to-r from-[#8e00ff] to-[#00ff8a] hover:opacity-90 text-[#0a0a1a] rounded-xl transition-all duration-300 hover:scale-[1.02]"
            >
              🎰 Crear Sorteo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // =================== CREATE GAME VIEW ===================
  if (view === "create-game") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a1a] relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/3 w-64 h-64 bg-[#8e00ff] opacity-10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/3 right-1/3 w-64 h-64 bg-[#00ff8a] opacity-10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-md w-full">
          <button
            onClick={() => setView("welcome")}
            className="text-[#8888aa] hover:text-[#00ff8a] mb-6 flex items-center gap-2 transition-colors"
          >
            ← Volver
          </button>

          <h2 className="text-3xl font-bold mb-2 gradient-text">
            Crear Sorteo
          </h2>
          <p className="text-[#8888aa] mb-8 text-sm">
            Define un PIN para acceder como organizador
          </p>

          <div className="space-y-6">
            <div className="neon-border rounded-xl p-6 bg-[#111127]">
              <Label
                htmlFor="pin"
                className="text-[#00ff8a] text-sm font-medium mb-2 block"
              >
                PIN de Organizador
              </Label>
              <Input
                id="pin"
                type="text"
                placeholder="Ej: 1234"
                value={pin}
                onChange={(e) => setPin(e.target.value.toUpperCase())}
                className="bg-[#0a0a1a] border-[#1a1a3e] text-[#e0e0f0] placeholder:text-[#555577] focus:border-[#00ff8a] focus:ring-[#00ff8a] h-12 text-lg text-center tracking-widest"
                maxLength={8}
              />
              <p className="text-[#8888aa] text-xs mt-2">
                Mínimo 4 caracteres. Este PIN te dará acceso exclusivo como
                organizador.
              </p>
            </div>

            <Button
              onClick={handleCreateGame}
              disabled={isLoading || pin.length < 4}
              className="w-full py-6 text-lg font-bold bg-gradient-to-r from-[#8e00ff] to-[#00ff8a] hover:opacity-90 text-[#0a0a1a] rounded-xl transition-all duration-300 disabled:opacity-50"
            >
              {isLoading ? "Creando..." : "🚀 Iniciar Sorteo"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // =================== ORGANIZER VIEW ===================
  if (view === "organizer" || view === "organizer-spinning") {
    const qrUrl = `${getBaseUrl()}/?game=${gameId}`;
    const spinning = view === "organizer-spinning";

    return (
      <div className="min-h-screen flex flex-col p-4 md:p-6 bg-[#0a0a1a] relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-0 w-96 h-96 bg-[#8e00ff] opacity-5 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#00ff8a] opacity-5 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl md:text-2xl font-bold gradient-text">
              CREASORTEOS - Panel de Control
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-[#8888aa] text-sm">PIN:</span>
              <span className="text-[#00ff8a] font-mono font-bold text-sm neon-text px-2 py-1 bg-[#111127] rounded">
                {game?.pin}
              </span>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {/* Left: QR Code + Info */}
            <div className="flex flex-col items-center gap-4">
              <div
                className={`rounded-2xl p-6 bg-[#111127] w-full flex flex-col items-center ${spinning ? "neon-border-purple" : "neon-border animate-pulse-neon"}`}
              >
                <p className="text-[#00ff8a] font-bold text-sm mb-4 uppercase tracking-wider">
                  Código QR para Participar
                </p>
                <div className="bg-white p-3 rounded-xl">
                  <QRCodeSVG
                    value={qrUrl}
                    size={180}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#0a0a1a"
                  />
                </div>
                <p className="text-[#8888aa] text-xs mt-3 text-center">
                  Escanea este código para inscribirte
                </p>
              </div>

              {/* Participant Counter */}
              <div className="gradient-border rounded-xl p-4 bg-[#111127] w-full text-center">
                <p className="text-[#8888aa] text-xs uppercase tracking-wider mb-1">
                  Participantes Inscritos
                </p>
                <p className="text-4xl font-bold text-[#00ff8a] neon-text">
                  {participantCount}
                </p>
              </div>

              {/* Participant List */}
              <div className="neon-border rounded-xl p-4 bg-[#111127] w-full max-h-48 overflow-y-auto">
                <p className="text-[#8888aa] text-xs uppercase tracking-wider mb-2">
                  Lista de Participantes
                </p>
                {participants.length === 0 ? (
                  <p className="text-[#555577] text-sm text-center py-2">
                    Esperando participantes...
                  </p>
                ) : (
                  <div className="space-y-1">
                    {participants.map((p, i) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 text-sm py-1 border-b border-[#1a1a3e] last:border-0"
                      >
                        <span className="text-[#8e00ff] font-mono text-xs">
                          {i + 1}.
                        </span>
                        <span className="text-[#e0e0f0]">{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Slot Machine + Controls */}
            <div className="flex flex-col items-center gap-4">
              {/* Slot Machine / Balota */}
              <div className="w-full max-w-lg">
                <SlotMachine
                  participants={participants.map((p) => ({
                    id: p.id,
                    name: p.name,
                  }))}
                  isSpinning={isSpinning}
                  onSpinComplete={handleSpinComplete}
                  winnerId={winnerId}
                />
              </div>

              {/* Controls */}
              <div className="w-full max-w-lg space-y-3">
                {!spinning ? (
                  <Button
                    onClick={handleStartSpin}
                    disabled={
                      isSpinning || isLoading || participants.length === 0
                    }
                    className="w-full py-5 text-lg font-bold bg-gradient-to-r from-[#8e00ff] to-[#00ff8a] hover:opacity-90 text-[#0a0a1a] rounded-xl transition-all duration-300 disabled:opacity-50"
                  >
                    {isSpinning ? "🎰 Girando..." : "🎰 JUGAR"}
                  </Button>
                ) : (
                  <div className="w-full py-5 text-center text-lg font-bold text-[#00ff8a] neon-text animate-pulse">
                    🎰 Sorteando...
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handleExportExcel}
                    disabled={participants.length === 0 || isLoading}
                    variant="outline"
                    className="py-4 border-[#1a1a3e] text-[#00d9ff] hover:bg-[#111127] hover:border-[#00d9ff] rounded-xl transition-all disabled:opacity-50"
                  >
                    📊 Excel
                  </Button>

                  <Button
                    onClick={handleReset}
                    disabled={isLoading || spinning}
                    variant="outline"
                    className="py-4 border-[#1a1a3e] text-[#ff3366] hover:bg-[#111127] hover:border-[#ff3366] rounded-xl transition-all disabled:opacity-50"
                  >
                    🔄 Reiniciar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =================== PARTICIPANT FORM VIEW ===================
  if (view === "participant-form") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a1a] relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#8e00ff] opacity-10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#00ff8a] opacity-10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-md w-full">
          <div className="mb-6 text-center">
            <span className="text-5xl">🎰</span>
          </div>
          <h1 className="text-3xl font-bold mb-2 gradient-text text-center">
            SORTEO
          </h1>
          <p className="text-[#8888aa] mb-6 text-center text-sm">
            Completa tus datos para participar
          </p>

          <div className="neon-border rounded-2xl p-6 bg-[#111127] space-y-4">
            <div>
              <Label
                htmlFor="name"
                className="text-[#00ff8a] text-sm font-medium mb-1.5 block"
              >
                Nombre
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Tu nombre completo"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-[#0a0a1a] border-[#1a1a3e] text-[#e0e0f0] placeholder:text-[#555577] focus:border-[#00ff8a] focus:ring-[#00ff8a] h-12"
              />
            </div>

            <div>
              <Label
                htmlFor="email"
                className="text-[#00ff8a] text-sm font-medium mb-1.5 block"
              >
                Correo Electrónico
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="bg-[#0a0a1a] border-[#1a1a3e] text-[#e0e0f0] placeholder:text-[#555577] focus:border-[#00ff8a] focus:ring-[#00ff8a] h-12"
              />
            </div>

            <div>
              <Label
                htmlFor="whatsapp"
                className="text-[#00ff8a] text-sm font-medium mb-1.5 block"
              >
                WhatsApp
              </Label>
              <Input
                id="whatsapp"
                type="tel"
                placeholder="+57 300 1234567"
                value={formWhatsapp}
                onChange={(e) => setFormWhatsapp(e.target.value)}
                className="bg-[#0a0a1a] border-[#1a1a3e] text-[#e0e0f0] placeholder:text-[#555577] focus:border-[#00ff8a] focus:ring-[#00ff8a] h-12"
              />
            </div>

            {formError && (
              <div className="text-[#ff3366] text-sm bg-[#ff3366]/10 p-3 rounded-lg border border-[#ff3366]/20">
                {formError}
              </div>
            )}

            <Button
              onClick={handleParticipate}
              disabled={
                isLoading ||
                !formName.trim() ||
                !formEmail.trim() ||
                !formWhatsapp.trim()
              }
              className="w-full py-6 text-lg font-bold bg-gradient-to-r from-[#8e00ff] to-[#00ff8a] hover:opacity-90 text-[#0a0a1a] rounded-xl transition-all duration-300 disabled:opacity-50"
            >
              {isLoading ? "Inscribiendo..." : "✨ PARTICIPAR"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // =================== PARTICIPANT WAITING VIEW ===================
  if (view === "participant-waiting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a1a] relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/3 w-64 h-64 bg-[#00ff8a] opacity-10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/3 right-1/3 w-64 h-64 bg-[#8e00ff] opacity-10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 text-center max-w-md w-full">
          <div className="neon-border rounded-2xl p-8 bg-[#111127] animate-pulse-neon">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-[#00ff8a] neon-text mb-2">
              ¡Estás Inscrito!
            </h2>
            <p className="text-[#8888aa] text-sm mb-6">
              Espera a que el organizador inicie el sorteo. Verás el resultado
              aquí en vivo.
            </p>
            <div className="flex items-center justify-center gap-2">
              <div
                className="w-2 h-2 bg-[#00ff8a] rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="w-2 h-2 bg-[#00ff8a] rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="w-2 h-2 bg-[#00ff8a] rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =================== WINNER VIEW ===================
  if (view === "winner") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a1a] relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00ff8a] opacity-15 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#8e00ff] opacity-15 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 text-center max-w-md w-full">
          {/* Neon flash effect */}
          <div
            className="absolute inset-0 bg-[#00ff8a] opacity-0 rounded-2xl"
            style={{ animation: "neonFlash 1.5s ease-out forwards" }}
          />

          <div className="relative neon-glow rounded-2xl p-8 bg-[#111127] border-2 border-[#00ff8a] overflow-hidden">
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-lg text-[#8888aa] uppercase tracking-widest mb-2">
              ¡El Ganador Es!
            </h2>
            <h1
              className="text-4xl md:text-5xl font-bold gradient-text mb-4"
              style={{ animation: "zoomInBounce 1s ease-out forwards" }}
            >
              {winner?.name || "---"}
            </h1>
            <div className="h-1 w-24 mx-auto bg-gradient-to-r from-[#8e00ff] to-[#00ff8a] rounded-full mb-4" />

            <style>{`
              @keyframes zoomInBounce {
                0% { transform: scale(0.2); opacity: 0; }
                50% { transform: scale(1.3); opacity: 1; }
                70% { transform: scale(0.85); }
                100% { transform: scale(1); opacity: 1; }
              }
              @keyframes neonFlash {
                0% { opacity: 0.6; }
                20% { opacity: 0; }
                40% { opacity: 0.4; }
                60% { opacity: 0; }
                80% { opacity: 0.2; }
                100% { opacity: 0; }
              }
            `}</style>

            {role === "organizer" && (
              <div className="space-y-3 mt-6">
                <Button
                  onClick={handleStartSpin}
                  disabled={isLoading || participants.length === 0}
                  className="w-full py-4 font-bold bg-gradient-to-r from-[#8e00ff] to-[#00ff8a] hover:opacity-90 text-[#0a0a1a] rounded-xl transition-all duration-300 disabled:opacity-50"
                >
                  🎲 Sortear de Nuevo
                </Button>
                <Button
                  onClick={handleExportExcel}
                  variant="outline"
                  className="w-full py-4 border-[#1a1a3e] text-[#00d9ff] hover:bg-[#0a0a1a] hover:border-[#00d9ff] rounded-xl transition-all"
                >
                  📊 Descargar Excel
                </Button>
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full py-4 border-[#1a1a3e] text-[#ff3366] hover:bg-[#0a0a1a] hover:border-[#ff3366] rounded-xl transition-all"
                >
                  🔄 Nuevo Sorteo (borra participantes)
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
