async function testLmsLinks() {
  const id = '69309149f53ad74946204d40';
  const urls = [
    `https://lms-e-learning-system.vercel.app/course-access/${id}`,
    `https://lms-e-learning-system.vercel.app/course/${id}`,
    `https://lms-e-learning-system.vercel.app/courses/${id}`,
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u);
      console.log(`${u} -> Status: ${res.status}`);
    } catch (e: any) {
      console.log(`${u} -> Error: ${e.message}`);
    }
  }
}

testLmsLinks().catch(console.error);
