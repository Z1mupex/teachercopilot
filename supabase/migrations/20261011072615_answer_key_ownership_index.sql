-- One composite unique index both enforces independent contexts and covers the
-- ownership FK. The parent worksheet UUID has exactly one owner, so this retains
-- one-batch-per-context semantics without two redundant indexes.
alter table public.grading_batches drop constraint grading_batches_answer_key_worksheet_id_key;
alter table public.grading_batches add constraint grading_batches_answer_key_unique unique(answer_key_worksheet_id,teacher_id);
