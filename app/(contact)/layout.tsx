import ContactNav from "@/components/contact-navbar";


const ContactLayout = ({ children }: { children: React.ReactNode }) => {
  return <main className="h-full ">
    <div className="w-full h-[900px]? overflow-hidden?  mx-auto">
      <ContactNav />
        {children}
    </div>
    </main>;
};

export default ContactLayout;
