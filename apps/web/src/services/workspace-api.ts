export interface WorkspaceMeta {
  id: string
  name: string
  owner_id: string
  created_at: string
  role: string
  member_count: number
  doc_count: number
}

export interface WorkspaceMember {
  id: string
  username: string
  name: string
  color: string
  role: string
  joined_at: string
}

export async function listWorkspaces(): Promise<WorkspaceMeta[]> {
  const res = await fetch('/api/workspaces')
  if (!res.ok) throw new Error('Failed to list workspaces')
  const data = await res.json()
  return data.workspaces
}

export async function getWorkspace(id: string) {
  const res = await fetch(`/api/workspaces/${id}`)
  if (!res.ok) throw new Error('Failed to get workspace')
  return res.json() as Promise<{
    workspace: { id: string; name: string; owner_id: string; created_at: string }
    members: WorkspaceMember[]
    documents: Array<{ id: string; name: string; thumbnail: string | null; created_by: string; created_at: string; updated_at: string }>
    role: string
  }>
}

export async function createWorkspace(name: string): Promise<{ id: string; name: string }> {
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create workspace')
  return res.json()
}

export async function inviteMember(workspaceId: string, username: string, role = 'editor'): Promise<void> {
  const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, role }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.statusMessage || 'Failed to invite')
  }
}
