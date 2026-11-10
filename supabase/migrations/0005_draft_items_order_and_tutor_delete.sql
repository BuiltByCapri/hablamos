-- Draft items keep the order they were extracted in, so a reviewer reads them
-- in lesson order rather than by random id.
alter table public.draft_items add column position int not null default 0;

-- A tutor replaces the items of their own discarded draft when the same
-- material is uploaded again, and removes items while reviewing. Students
-- already can, through draft_items_student.
create policy draft_items_tutor_delete on public.draft_items for delete to authenticated
  using (exists (
    select 1 from public.uploads u
    where u.id = draft_items.upload_id
      and u.uploader_id = (select auth.uid())
      and (select public.is_linked_tutor(u.student_id))
  ));
