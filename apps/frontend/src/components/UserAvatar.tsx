import { useUser } from '@repo/store/useUser';
import { Metadata, Player } from '../screens/Game';

interface UserAvatarProps {
  gameMetadata: Metadata | null;
  self?: boolean;
}

export const UserAvatar = ({ gameMetadata, self }: UserAvatarProps) => {
  const user = useUser();
  const white = gameMetadata?.whitePlayer;
  const black = gameMetadata?.blackPlayer;
  const player: Player | undefined = black?.id === user.id ? (self ? black : white) : self ? white : black;

  return (
    <div className="text-white flex gap-2 ">
      <p>{player?.name}</p>
      {player?.isGuest && <p className="text-gray-500">[Guest]</p>}
    </div>
  );
};
