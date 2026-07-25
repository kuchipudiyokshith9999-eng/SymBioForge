import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-6">
      <Card className="bg-zinc-950/50 border-zinc-800">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your public profile information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 border border-zinc-800">
              <AvatarImage src="/avatars/admin.jpg" alt="Admin" />
              <AvatarFallback className="bg-zinc-800 text-lg">AD</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button variant="outline" className="border-zinc-700 text-zinc-300">Change Avatar</Button>
              <p className="text-xs text-zinc-500">JPG, GIF or PNG. 1MB max.</p>
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">First Name</label>
              <Input defaultValue="Admin" className="bg-zinc-900/50 border-zinc-800" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Last Name</label>
              <Input defaultValue="User" className="bg-zinc-900/50 border-zinc-800" />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Email Address</label>
            <Input defaultValue="admin@symbioforge.com" className="bg-zinc-900/50 border-zinc-800" />
          </div>

          <div className="pt-4 flex justify-end">
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white">Save Changes</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
