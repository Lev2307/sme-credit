from rest_framework import routers

from .views import ApplicationAPIViewset

router = routers.DefaultRouter(trailing_slash=False)
router.register("applications", ApplicationAPIViewset, basename="application")

urlpatterns = router.urls