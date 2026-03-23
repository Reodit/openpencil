import { useCollabStore, type PeerUser } from '@/stores/collab-store'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'

/**
 * Shows colored avatar circles for each connected peer in the editor top bar.
 * Only visible when collaboration is active (SSE connected + peers present).
 */
export default function CollabPresence() {
  const isConnected = useCollabStore((s) => s.isConnected)
  const peers = useCollabStore((s) => s.peers)

  if (!isConnected || peers.size === 0) return null

  const peerList = Array.from(peers.values())

  return (
    <div className="flex items-center gap-0.5">
      {/* Connection indicator dot */}
      <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />

      {peerList.map((peer) => (
        <PeerAvatar key={peer.userId} peer={peer} />
      ))}
    </div>
  )
}

function PeerAvatar({ peer }: { peer: PeerUser }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white cursor-default -ml-1 first:ml-0 border-2 border-card"
          style={{ backgroundColor: peer.color }}
        >
          {peer.name[0].toUpperCase()}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{peer.name}</TooltipContent>
    </Tooltip>
  )
}
