import Navbar from "@/components/navbar";
import Sidebar from "@/components/sidebar";
import { getApiLimitCount } from "@/lib/api-limit";

const DashboardLayout = async ({ children }: { children: React.ReactNode }) => {
 // const apiLImitCount = await getApiLimitCount()
  return (
    <div className="relative h-full">
      <div className="hidden h-full md:flex md:flex-col md:w-60 md:fixed md:inset-y-0  bg-gray-900">
        <Sidebar apiLimitCount={0}/>
      </div>
      
      <main className="md:pl-60">
        <Navbar/>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
