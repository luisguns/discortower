delete from public.activity_catalog where slug = 'steam';

update public.activity_catalog
set process_names = array['minecraft.exe'], updated_at = timezone('utc', now())
where slug = 'minecraft';
