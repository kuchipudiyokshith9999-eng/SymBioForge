"use client";

import { useFetch } from "@/lib/hooks";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { PageSkeleton } from "@/components/Skeleton";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import { Factory, Droplets, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

interface WasteStream {
  name: string;
  category: string;
  volume: number;
  maxVolume?: number;
  contamination: string;
  reusePotential: number;
  seasonalVariation?: string;
}

interface FactoryProfile {
  id: string;
  name: string;
  wasteStreams: WasteStream[];
}

const contaminationConfig: Record<string, { color: string; bg: string }> = {
  high: { color: "text-red-400", bg: "bg-red-400" },
  medium: { color: "text-amber-400", bg: "bg-amber-400" },
  low: { color: "text-emerald-400", bg: "bg-emerald-400" },
};

function getContamination(level: string) {
  return contaminationConfig[level?.toLowerCase()] ?? contaminationConfig.low;
}

export default function WasteProfilesPage() {
  const { data, loading, error, refetch } = useFetch<FactoryProfile[]>("/api/waste-profiles");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const factories = data ?? [];
  const selected = selectedId ? factories.find((f) => f.id === selectedId) : factories[0];

  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title="Waste Profiles"
        description="Factory waste streams, contamination levels, and reuse potential"
      />

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="lg:w-64 flex-shrink-0">
          <Card padding="none">
            <div className="px-4 py-3 border-b border-zinc-800">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                Select Factory
              </span>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {factories.map((f) => {
                const isActive = (selected?.id ?? factories[0]?.id) === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className={`w-full px-4 py-3 text-left text-sm flex items-center gap-2.5 transition-all duration-100 border-l-2 ${
                      isActive
                        ? "bg-zinc-800/50 text-zinc-100 border-emerald-500"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/20 border-transparent"
                    }`}
                  >
                    <Factory className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-emerald-400" : ""}`} />
                    <span className="truncate text-[13px]">{f.name}</span>
                    <span className="ml-auto text-[11px] text-zinc-600 font-mono">
                      {f.wasteStreams?.length ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="flex-1 min-w-0">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-zinc-100">{selected.name}</h2>
                <span className="text-xs text-zinc-500">
                  {(selected.wasteStreams ?? []).length} waste streams
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(selected.wasteStreams ?? []).map((ws, i) => {
                  const contam = getContamination(ws.contamination);
                  const reusePct = Math.round((ws.reusePotential ?? 0) * 100);
                  const volumePct = ws.maxVolume ? Math.min(100, (ws.volume / ws.maxVolume) * 100) : 100;

                  return (
                    <Card key={i} hover>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-zinc-200">{ws.name}</h3>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50 font-medium">
                          {ws.category}
                        </span>
                      </div>

                      <div className="space-y-3">
                        <ProgressRow
                          icon={Droplets}
                          label="Volume"
                          value={`${ws.volume} / ${ws.maxVolume ?? ws.volume}`}
                          percentage={volumePct}
                          barColor="bg-blue-500"
                        />

                        <ProgressRow
                          icon={RefreshCw}
                          label="Reuse Potential"
                          value={`${reusePct}%`}
                          percentage={reusePct}
                          barColor={reusePct >= 70 ? "bg-emerald-500" : reusePct >= 40 ? "bg-amber-500" : "bg-red-500"}
                        />

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className={`w-3 h-3 ${contam.color}`} />
                            <span className="text-xs text-zinc-500">Contamination</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${contam.bg}`} />
                            <span className={`text-xs font-medium capitalize ${contam.color}`}>
                              {ws.contamination}
                            </span>
                          </div>
                        </div>

                        {ws.seasonalVariation && (
                          <p className="text-[11px] text-zinc-600 pt-1 border-t border-zinc-800/50">
                            Seasonal: {ws.seasonalVariation}
                          </p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {(selected.wasteStreams ?? []).length === 0 && (
                <EmptyState icon={Trash2} title="No waste streams recorded" />
              )}
            </div>
          ) : (
            <EmptyState icon={Factory} title="Select a factory" description="Choose a factory from the list to view its waste profile" />
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressRow({
  icon: Icon,
  label,
  value,
  percentage,
  barColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  percentage: number;
  barColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1 text-xs text-zinc-500">
          <Icon className="w-3 h-3" />
          {label}
        </span>
        <span className="text-xs text-zinc-400 font-mono">{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
