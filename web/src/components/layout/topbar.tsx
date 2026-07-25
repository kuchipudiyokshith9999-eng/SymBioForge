"use client"

import { Bell, Search, Command, CheckCircle2, AlertTriangle, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function Topbar() {
  return (
    <div className="h-16 border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center flex-1">
        {/* Command Palette Trigger */}
        <div className="relative w-96 hidden md:flex items-center group">
          <Search className="absolute left-3 h-4 w-4 text-zinc-400 group-hover:text-zinc-300 transition-colors" />
          <Input 
            type="text" 
            placeholder="Search factories, products, pages..." 
            className="pl-10 pr-12 bg-zinc-900 border-zinc-800 text-sm focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-full w-full placeholder:text-zinc-500 cursor-text"
            readOnly
          />
          <div className="absolute right-3 flex items-center space-x-1">
            <kbd className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[10px] font-medium text-zinc-400 opacity-100">
              <Command className="h-3 w-3" />
            </kbd>
            <kbd className="inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[10px] font-medium text-zinc-400 opacity-100">
              K
            </kbd>
          </div>
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white rounded-full relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-zinc-950"></span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 bg-zinc-950 border-zinc-800 p-0" align="end">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <span className="font-semibold text-sm text-zinc-200">Notifications</span>
              <span className="text-xs text-emerald-400 cursor-pointer">Mark all read</span>
            </div>
            <div className="max-h-[300px] overflow-auto flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-900/50 cursor-pointer flex gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-zinc-300 mb-0.5">Compliance Deadline</p>
                  <p className="text-xs text-zinc-500">2 factories have pending SPCB Form V filings due in 7 days.</p>
                </div>
              </div>
              <div className="px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-900/50 cursor-pointer flex gap-3">
                <Lightbulb className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-zinc-300 mb-0.5">New Opportunity</p>
                  <p className="text-xs text-zinc-500">Inventor agent proposed a new product concept: EcoBoard-7.</p>
                </div>
              </div>
              <div className="px-4 py-3 hover:bg-zinc-900/50 cursor-pointer flex gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-zinc-300 mb-0.5">Report Generated</p>
                  <p className="text-xs text-zinc-500">Clerk successfully generated compliance PDF for Lakshmi Textiles.</p>
                </div>
              </div>
            </div>
            <div className="p-2 border-t border-zinc-800 text-center">
              <span className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">View all notifications</span>
            </div>
          </PopoverContent>
        </Popover>

        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 p-0.5 cursor-pointer">
          <div className="h-full w-full rounded-full bg-zinc-950 border border-zinc-800/50 flex items-center justify-center">
            <span className="text-xs font-semibold text-white">AD</span>
          </div>
        </div>
      </div>
    </div>
  )
}
