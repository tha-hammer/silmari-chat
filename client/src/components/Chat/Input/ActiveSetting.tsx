import { useLocalize } from '~/hooks';

export default function ActiveSetting() {
  const localize = useLocalize();

  return (
    <div className="text-token-text-tertiary space-x-2 overflow-hidden text-ellipsis text-sm font-light">
      {localize('com_files_talking_to')}{' '}
      <span className="text-token-text-secondary font-medium">
        {localize('com_files_demo_model_name')}
      </span>
    </div>
  );
}
