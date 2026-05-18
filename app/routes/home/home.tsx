import type { Route } from "./+types/home";
import { getAuthSession } from "~/services/auth.server";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { Button } from "~/components/Button/Button";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Scribe ATP" },
    {
      name: "description",
      content: "Scribe ATP is a ATproto driven content management system.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { handle, isAuthenticated } = await getAuthSession(request);
  return { userName: handle ?? null, isAuthenticated };
}

export function HydrateFallback() {
  return <div>Loading...</div>;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { userName, isAuthenticated } = loaderData;
  const { isOpen, open, close } = useModal();

  return (
    <>
      <h1>Home Page</h1>
      <p>
        {userName} is {isAuthenticated == false && "NOT"} Authenticated
      </p>
      {/* <Button onClick={open}>Open Example Modal</Button>
      <Modal
        isOpen={isOpen}
        onClose={close}
        title="Example Modal"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={close}>Proceed</Button>
          </>
        }
      >
        <p>This is an example of the Modal component rendered via a portal.</p>
        <p>Click the backdrop, press Escape, or use the buttons below to close it.</p>
      </Modal> */}
    </>
  );
}
