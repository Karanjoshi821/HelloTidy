"use client";

import { useActionState, useTransition, type FormEvent } from "react";

/**
 * useActionState for forms that must keep what the user typed.
 *
 * Passing an action to <form action> makes React 19 reset the fields after
 * every submit, so a customer who mistypes one field loses everything.
 * Dispatching from onSubmit inside a transition keeps the inputs.
 */
export function useFormAction<State>(
  action: (state: Awaited<State>, formData: FormData) => State | Promise<State>,
  initialState: Awaited<State>,
) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const [, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Include the clicked button's name/value, so one form can offer "Save" and "Save & ship".
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, pending };
}
